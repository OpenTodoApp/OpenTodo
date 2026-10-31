// An in-memory folder, the vectors' scripted server and their test crypter,
// for the engine's tests. Never imported by the plugin.
import type { Op } from './store'
import type { Crypter, FileAdapter, Reply, Request, Transport } from './types'

export class MemoryFiles implements FileAdapter {
  files = new Map<string, string>()
  writes: string[] = []

  constructor(init: Record<string, string> = {}) {
    for (const [p, t] of Object.entries(init)) this.files.set(p, t)
  }

  async list(): Promise<string[]> {
    return [...this.files.keys()].sort()
  }

  async read(path: string): Promise<string | null> {
    return this.files.get(path) ?? null
  }

  async write(path: string, text: string, expected?: string | null): Promise<boolean> {
    if (expected !== undefined && (this.files.get(path) ?? null) !== expected) return false
    this.files.set(path, text)
    this.writes.push(path)
    return true
  }

  async writeAtomic(path: string, text: string): Promise<void> {
    await this.write(path, text)
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path)
  }

  async removeDir(): Promise<void> {}

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || [...this.files.keys()].some((p) => p.startsWith(path + '/'))
  }

  /** Every file outside .opentodo/. */
  snapshot(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [p, t] of this.files) if (!p.startsWith('.opentodo/')) out[p] = t
    return out
  }
}

/** The scripted server of the vectors (vxServer in syncvectors_test.go). */
export class VectorServer implements Transport {
  log: Op[] = []
  gen = ''
  now = 0
  received: Op[] = []
  constructor(public shared: string[] = []) {}

  async exchange(req: Request): Promise<Reply> {
    const sent = JSON.parse(JSON.stringify(req.ops)) as Op[]
    this.received.push(...sent)
    const rep: Reply = { ops: [], serverTime: this.now, generation: this.gen, cursor: this.log.length, memberships: this.shared.map((projectId) => ({ projectId })) }
    if (req.cursor < this.log.length) rep.ops = JSON.parse(JSON.stringify(this.log.slice(req.cursor)))
    this.log.push(...sent)
    if (sent.length > 0) rep.cursor = this.log.length
    return rep
  }
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url')

/** The vectors' test crypter (fakeCrypter in the Go tests): bound to the entity id like the real envelope. */
export const testCrypter: Crypter = {
  async seal(_entity, id, _field, pt) {
    return `enc:v1:${id}:${b64(pt)}`
  },
  async open(_entity, id, _field, value) {
    const prefix = `enc:v1:${id}:`
    if (!value.startsWith(prefix)) throw new Error('wrong binding')
    return Buffer.from(value.slice(prefix.length), 'base64url').toString('utf8')
  },
}

