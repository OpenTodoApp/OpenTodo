// The changed-worker warning (OpenSpec change signed-web-app, design D8). A
// service worker cannot vet its successor: the browser installs any new sw.js
// the server sends. So once refusal is on, when a new worker installs or takes
// control, the page checks that the server's sw.js is one a verified list
// names: the installed list, or the server's current list when a key the device
// trusts signed it for a newer version (a release the new worker is about to
// install, or one refused for another reason, which the refusal banner explains). Anything else means the server changed how the app
// checks updates. A determined server can defeat this (it can serve the page
// other bytes than the browser), so it is a warning, not a defence. Loaded only
// when a worker changes.
import { compareVersions, MANIFEST_PATH, parseList, sha256Hex, verifyList } from './appCode'
import { loadTrust, type TrustRecord } from './appTrust'

export interface WorkerCheckEnv {
  load: () => Promise<TrustRecord | null>
  /** A file of the server (sw.js, app-manifest.json), never from a cache. */
  fetch: (path: string) => Promise<Response>
}

const browserEnv: WorkerCheckEnv = {
  load: () => loadTrust(),
  fetch: (path) => fetch('/' + path, { cache: 'no-store', credentials: 'same-origin', redirect: 'error' }),
}

/** The file's bytes; null when the server has none, undefined when the network failed. */
async function bytes(env: WorkerCheckEnv, path: string): Promise<ArrayBuffer | null | undefined> {
  let res: Response
  try {
    res = await env.fetch(path)
  } catch {
    return undefined
  }
  return res.ok ? res.arrayBuffer().catch(() => undefined) : null
}

/**
 * Whether the server's current list, signed by a trusted key for a version newer
 * than the installed one, names this worker; undefined when the network failed.
 */
async function signedListNames(env: WorkerCheckEnv, record: TrustRecord, worker: string): Promise<boolean | undefined> {
  const body = await bytes(env, MANIFEST_PATH)
  if (body === undefined) return undefined
  const list = body ? parseList(new TextDecoder().decode(body)) : null
  if (!list || list.manifest.worker?.sha256 !== worker) return false
  if (compareVersions(list.manifest.version, record.verified?.version ?? record.current?.version ?? '') <= 0) return false
  return 'signer' in (await verifyList(list, record.keys))
}

/**
 * Whether the server serves a service worker that no verified list names.
 * False while refusal is off, without a record or a worker hash (a record from
 * before this check), when the network fails, or when the server has no sw.js.
 */
export async function workerChanged(env: WorkerCheckEnv = browserEnv): Promise<boolean> {
  const record = await env.load().catch(() => null)
  const want = record?.refuse ? record.current?.worker : undefined
  if (!record || !want) return false
  const body = await bytes(env, 'sw.js')
  if (!body) return false
  const got = await sha256Hex(body)
  if (got === want) return false
  return (await signedListNames(env, record, got)) === false
}
