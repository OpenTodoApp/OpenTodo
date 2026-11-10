// What the two IndexedDB engines need from the runtime that Hermes may not have:
// DOMException (fake-indexeddb's errors extend it at load) and structuredClone (it
// copies every value it stores and returns). Installed before either engine loads,
// with Web Crypto, which lib0 (Yjs) reads when it loads.
//
// Dexie loads first: at load it takes the promise crypto.subtle.digest returns as the
// engine's native promise, whose `then` it patches to keep a transaction's zone across
// `await`. react-native-quick-crypto's digest is not Hermes' own promise, so with
// crypto installed first, every await in a transaction lost it (PrematureCommitError).
import 'dexie'
import { installCrypto } from '../src/crypto'

installCrypto()

const g = globalThis as Record<string, unknown>

;(g as { __spikeStart?: number }).__spikeStart ??= performance.now()

// React Native shims setImmediate with queueMicrotask (Libraries/Core/setUpTimers.js).
// Both engines schedule IndexedDB's "next task" with it, which has to be a macrotask,
// after the microtasks. setTimeout is one, but React Native runs timers on frames
// (about 17 ms each: a 20,000-row seed took 336 s); a task of the New Architecture's
// runtime scheduler runs at once.
interface RuntimeScheduler { unstable_scheduleCallback(priority: unknown, cb: () => void): unknown; unstable_cancelCallback(task: unknown): void; unstable_NormalPriority: unknown }
const rs = g.nativeRuntimeScheduler as RuntimeScheduler | undefined
;(g as { __spikeScheduler?: string }).__spikeScheduler = rs ? 'nativeRuntimeScheduler' : 'setTimeout'
g.setImmediate = rs
  ? (fn: (...a: unknown[]) => void, ...args: unknown[]) => rs.unstable_scheduleCallback(rs.unstable_NormalPriority, () => fn(...args))
  : (fn: (...a: unknown[]) => void, ...args: unknown[]) => setTimeout(() => fn(...args), 0)
g.clearImmediate = rs ? (task: unknown) => rs.unstable_cancelCallback(task) : (id: ReturnType<typeof setTimeout>) => clearTimeout(id)

if (typeof g.DOMException !== 'function') {
  const codes: Record<string, number> = { IndexSizeError: 1, NotFoundError: 8, NotSupportedError: 9, InvalidStateError: 11, SyntaxError: 12, InvalidAccessError: 15, TimeoutError: 23, DataCloneError: 25 }
  g.DOMException = class DOMException extends Error {
    constructor(message = '', name = 'Error') {
      super(message)
      this.name = name
    }
    get code(): number { return codes[this.name] ?? 0 }
  }
}

function clone(v: unknown, seen: Map<object, unknown>): unknown {
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'function' || typeof v === 'symbol') throw new (g.DOMException as typeof Error)('could not be cloned', 'DataCloneError')
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

if (typeof g.structuredClone !== 'function') g.structuredClone = (v: unknown) => clone(v, new Map())

export {}
