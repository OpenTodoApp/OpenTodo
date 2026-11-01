// Runs the editor's computations (compute.ts) in a worker when the browser has
// one, else on the main thread after a tick (tests, very old browsers). Requests
// answer in order; a resolve that a newer resolve replaced before it started is
// skipped, so dragging a slider never queues stale work.
import type { ComputeRequest, ComputeResult, FixOutcome, Resolution } from './compute'
import type { ThemeDocument } from './format'

type Pending = { req: ComputeRequest; resolve: (r: ComputeResult) => void; reject: (e: Error) => void }

export interface Resolver {
  /** The resolution of a draft; the latest call wins, an earlier one still waiting is answered with null. */
  resolve(doc: ThemeDocument): Promise<Resolution | null>
  fix(doc: ThemeDocument, pair: { fg: string; bg: string }): Promise<FixOutcome | null>
  fixAll(doc: ThemeDocument): Promise<FixOutcome>
  dispose(): void
}

export function createResolver(useWorker = typeof Worker !== 'undefined' && import.meta.env.MODE !== 'test'): Resolver {
  let worker: Worker | null = null
  if (useWorker) {
    try {
      worker = new Worker(new URL('./compute.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      worker = null
    }
  }
  let seq = 0
  let busy = false
  const queue: (Pending & { seq: number })[] = []
  const waiting = new Map<number, Pending>()
  let local: Promise<typeof import('./compute')> | null = null

  const next = () => {
    if (busy) return
    // A resolve followed by a newer resolve is answered with null.
    while (queue.length > 1 && queue[0].req.type === 'resolve' && queue.some((q, i) => i > 0 && q.req.type === 'resolve')) queue.shift()!.resolve(null)
    const item = queue.shift()
    if (!item) return
    busy = true
    const done = () => { busy = false; next() }
    if (worker) {
      waiting.set(item.seq, item)
      worker.postMessage({ seq: item.seq, req: item.req })
      return
    }
    local ??= import('./compute')
    local.then((m) => new Promise<void>((ok) => setTimeout(() => {
      try { item.resolve(m.compute(item.req)) } catch (e) { item.reject(e as Error) }
      ok()
    }, 0))).then(done, (e) => { item.reject(e as Error); done() })
  }
  if (worker) {
    worker.onmessage = (e: MessageEvent<{ seq: number; result?: ComputeResult; error?: string }>) => {
      const p = waiting.get(e.data.seq)
      waiting.delete(e.data.seq)
      if (p) {
        if (e.data.error) p.reject(new Error(e.data.error))
        else p.resolve(e.data.result ?? null)
      }
      busy = false
      next()
    }
  }
  const ask = (req: ComputeRequest) => new Promise<ComputeResult>((resolve, reject) => {
    queue.push({ req, resolve, reject, seq: ++seq })
    next()
  })
  return {
    resolve: (doc) => ask({ type: 'resolve', doc }) as Promise<Resolution | null>,
    fix: (doc, pair) => ask({ type: 'fix', doc, pair }) as Promise<FixOutcome | null>,
    fixAll: (doc) => ask({ type: 'fixAll', doc }) as Promise<FixOutcome>,
    dispose: () => {
      worker?.terminate()
      worker = null
      for (const q of queue.splice(0)) q.resolve(null)
      for (const p of waiting.values()) p.resolve(null)
      waiting.clear()
    },
  }
}
