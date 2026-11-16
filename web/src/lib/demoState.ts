import type { DemoInfo } from './types'
import { createStore } from './store'
import { readJSON, writeString } from './deviceStorage'

/**
 * Whether this server is a demo instance (OpenSpec `demo-mode`), as `auth/status`
 * last said, remembered on this device. Kept apart from `demo.ts` so the data
 * layer the native app shares can skip the routes a demo refuses without
 * pulling in the banner's text.
 */
const KEY = 'opentodo.demo'
const store = createStore<DemoInfo | null>('demo', readJSON<DemoInfo | null>(KEY, null))

/** Record the server's demo state (null when the instance is not a demo). */
export function setDemo(info: DemoInfo | null | undefined): void {
  // The creation token changes on every read; only the stable part is kept.
  const next = info ? { ...info, token: '' } : null
  if (JSON.stringify(next) === JSON.stringify(store.get())) return
  // Storage unavailable (private mode): the state still lives in memory.
  writeString(KEY, next ? JSON.stringify(next) : null)
  store.set(next)
}

export const getDemo = store.get

/** The demo state, re-rendering when it changes. */
export const useDemo = store.use
