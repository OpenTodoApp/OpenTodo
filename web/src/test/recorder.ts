// Records request/response pairs of a client for the client compatibility test
// (OpenSpec change `stability-contract`, design D5; docs/stability.md "Clients
// across versions"). A proxy in front of the server keeps every /api/v1/ call in
// order; internal/tenant TestV1ClientsReplay replays them against the current
// server and fails when a recorded response field is missing or changed type.
//
// Secrets never reach the file: session cookies and API tokens become labels
// ("session:1", "token:1") that the replay maps to its own, and passwords become
// "<password>".
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { writeFileSync } from 'node:fs'

/** One recorded call. */
export interface Pair {
  client: string
  request: { method: string; path: string; auth: string; headers?: Record<string, string>; body?: unknown }
  response: { status: number; session?: string; body?: unknown }
}

/** The headers a replay sends as recorded (none of them a secret). */
const KEPT_HEADERS = ['content-type', 'idempotency-key', 'x-opentodo-device', 'x-client-version']

export const PASSWORD = '<password>'
const SECRET_KEYS = new Set(['password', 'newPassword', 'currentPassword'])

/** label: one stable name per distinct secret value ("session:1"). */
function labeller() {
  const seen = new Map<string, string>()
  const counts: Record<string, number> = {}
  return (kind: string, value: string): string => {
    let l = seen.get(value)
    if (!l) {
      counts[kind] = (counts[kind] ?? 0) + 1
      l = `${kind}:${counts[kind]}`
      seen.set(value, l)
    }
    return l
  }
}

/** scrub: a JSON value with passwords and API token secrets replaced. */
export function scrub(v: unknown, label: (kind: string, value: string) => string): unknown {
  if (typeof v === 'string') return /^ot_[A-Za-z0-9_-]{16,}$/.test(v) ? `<${label('token', v)}>` : v
  if (Array.isArray(v)) return v.map((x) => scrub(x, label))
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) out[k] = SECRET_KEYS.has(k) && typeof x === 'string' ? PASSWORD : scrub(x, label)
    return out
  }
  return v
}

const sessionOf = (cookie: string) => cookie.split(/;\s*/).find((c) => c.startsWith('opentodo_session='))?.slice('opentodo_session='.length) ?? ''

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = []
    req.on('data', (d: Buffer) => parts.push(d))
    req.on('end', () => resolve(Buffer.concat(parts)))
    req.on('error', reject)
  })
}

function parse(buf: Buffer, type: string | null): unknown {
  if (!buf.length) return undefined
  if (!(type ?? '').includes('json')) return `<${buf.length} bytes>`
  try {
    return JSON.parse(buf.toString('utf8'))
  } catch {
    return `<${buf.length} bytes>`
  }
}

/** startRecorder: a proxy to target on a free port that records every /api/v1/ call. */
export async function startRecorder(target: string): Promise<{ url: string; pairs: Pair[]; close: () => Promise<void> }> {
  const pairs: Pair[] = []
  const label = labeller()
  let client = 'web'
  const server: Server = createServer(async (req, res) => {
    // POST /__record/client?name=ot: the calls that follow are that client's.
    if (req.url?.startsWith('/__record/client')) {
      client = new URL(req.url, 'http://x').searchParams.get('name') || 'web'
      res.writeHead(204).end()
      return
    }
    const path = req.url ?? ''
    let body: Buffer, up: Response, out: Buffer, set: string[]
    try {
      body = await readBody(req)
      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string' && k !== 'host' && k !== 'content-length') headers.set(k, v)
      up = await fetch(target + path, { method: req.method, headers, body: body.length ? new Uint8Array(body) : undefined, redirect: 'manual' })
      set = up.headers.getSetCookie()
      for (const [k, v] of up.headers) if (k !== 'set-cookie' && k !== 'content-encoding' && k !== 'content-length') res.setHeader(k, v)
      if (set.length) res.setHeader('set-cookie', set)
      res.writeHead(up.status)
      if (path.startsWith('/api/v1/sync/events') && up.body) {
        // A live stream is passed through as it comes and not recorded.
        for await (const chunk of up.body) res.write(chunk)
        res.end()
        return
      }
      out = Buffer.from(await up.arrayBuffer())
      res.end(out)
    } catch (err) {
      if (!res.headersSent) res.writeHead(502)
      res.end(String(err))
      return
    }
    if (!path.startsWith('/api/v1/')) return
    const cookie = sessionOf(req.headers.cookie ?? '')
    const bearer = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1]
    const auth = bearer ? label('token', bearer) : cookie ? label('session', cookie) : 'none'
    const kept: Record<string, string> = {}
    for (const h of KEPT_HEADERS) if (req.headers[h] && typeof req.headers[h] === 'string') kept[h] = req.headers[h] as string
    const newSession = set.map(sessionOf).find((s) => s)
    pairs.push({
      client,
      request: { method: req.method ?? 'GET', path, auth, ...(Object.keys(kept).length ? { headers: kept } : {}), ...(body.length ? { body: scrub(parse(body, req.headers['content-type'] ?? null), label) } : {}) },
      response: { status: up.status, ...(newSession ? { session: label('session', newSession) } : {}), ...(out.length ? { body: scrub(parse(out, up.headers.get('content-type')), label) } : {}) },
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  return {
    url: `http://127.0.0.1:${port}`,
    pairs,
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()) }),
  }
}

/** writeRecordings: one file per client (<dir>/<client>.json) as the replay test reads them. */
export function writeRecordings(dir: string, pairs: Pair[]): void {
  for (const client of new Set(pairs.map((p) => p.client))) {
    writeRecording(`${dir}/${client}.json`, client, pairs.filter((p) => p.client === client).map(({ request, response }) => ({ request, response })))
  }
}

function writeRecording(file: string, client: string, pairs: Omit<Pair, 'client'>[]): void {
  const doc = {
    about: `Requests and responses of the ${client} client, recorded by the client compatibility recorder (OpenSpec change stability-contract, design D5). ` +
      'internal/tenant TestV1ClientsReplay replays them in order against the current server: every recorded response field must still be there with the same type. ' +
      'Recorded once per major version; never regenerated within it (new files may be added).',
    client,
    pairs,
  }
  writeFileSync(file, JSON.stringify(doc, null, 1) + '\n')
}
