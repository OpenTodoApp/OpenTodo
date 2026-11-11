// What the shared library needs from the runtime that Hermes does not have, found by the
// storage spike (design D4) and installed by src/setup.ts before any shared module loads:
//
// - setImmediate as a task. React Native shims it with queueMicrotask, which runs before
//   pending promise callbacks are done and starves the frame; setTimeout is a task but is
//   aligned to frames (about 17 ms each). The New Architecture's runtime scheduler runs a
//   task at once.
// - DOMException, which some modules construct for their errors.
// - structuredClone, for the values of plain data the shared code copies.
const g = globalThis as Record<string, unknown>

interface RuntimeScheduler {
  unstable_scheduleCallback(priority: unknown, cb: () => void): unknown
  unstable_cancelCallback(task: unknown): void
  unstable_NormalPriority: unknown
}

export function installPolyfills(): void {
  const rs = g.nativeRuntimeScheduler as RuntimeScheduler | undefined
  if (rs) {
    g.setImmediate = (fn: (...a: unknown[]) => void, ...args: unknown[]) => rs.unstable_scheduleCallback(rs.unstable_NormalPriority, () => fn(...args))
    g.clearImmediate = (task: unknown) => rs.unstable_cancelCallback(task)
  }

  if (typeof g.DOMException !== 'function') {
    const codes: Record<string, number> = { IndexSizeError: 1, NotFoundError: 8, NotSupportedError: 9, InvalidStateError: 11, SyntaxError: 12, InvalidAccessError: 15, AbortError: 20, TimeoutError: 23, DataCloneError: 25 }
    g.DOMException = class DOMException extends Error {
      constructor(message = '', name = 'Error') {
        super(message)
        this.name = name
      }
      get code(): number { return codes[this.name] ?? 0 }
    }
  }

  if (typeof g.structuredClone !== 'function') g.structuredClone = (v: unknown) => clone(v, new Map())
}

/** The structured clone of plain data: objects, arrays, Date, RegExp, Map, Set and binary. */
export function clone(v: unknown, seen: Map<object, unknown>): unknown {
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'function' || typeof v === 'symbol') throw new (g.DOMException as new (m: string, n: string) => Error)('could not be cloned', 'DataCloneError')
    return v
  }
  const done = seen.get(v)
  if (done !== undefined) return done
  if (v instanceof Date) return new Date(v.getTime())
  if (v instanceof RegExp) return new RegExp(v.source, v.flags)
  if (v instanceof ArrayBuffer) return v.slice(0)
  if (ArrayBuffer.isView(v)) {
    const C = v.constructor as new (b: ArrayBuffer) => ArrayBufferView
    return new C((v.buffer as ArrayBuffer).slice(v.byteOffset, v.byteOffset + v.byteLength))
  }
  if (v instanceof Map) {
    const m = new Map()
    seen.set(v, m)
    for (const [k, x] of v) m.set(clone(k, seen), clone(x, seen))
    return m
  }
  if (v instanceof Set) {
    const s = new Set()
    seen.set(v, s)
    for (const x of v) s.add(clone(x, seen))
    return s
  }
  if (Array.isArray(v)) {
    const a: unknown[] = new Array(v.length)
    seen.set(v, a)
    for (let i = 0; i < v.length; i++) a[i] = clone(v[i], seen)
    return a
  }
  const o: Record<string, unknown> = {}
  seen.set(v, o)
  for (const k of Object.keys(v)) o[k] = clone((v as Record<string, unknown>)[k], seen)
  return o
}
