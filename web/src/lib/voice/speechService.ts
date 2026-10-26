// Whether the owner connected a speech-to-text service, and its host (OpenSpec
// change settings-refresh, design D7). Read from /me when online and remembered
// on this device, so the Voice capture card can offer "This server's speech
// service" and name its host. Kept out of the voice engine chunk: the card needs it.
import { useEffect } from 'react'
import { api } from '../api'
import type { SpeechService } from '../types'
import { createStore } from '../store'

const KEY = 'opentodo.speech-service'
const NONE: SpeechService = { connected: false }

const store = createStore<SpeechService>('speechService', read())

function read(): SpeechService {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as SpeechService | null
    return v && typeof v.connected === 'boolean' ? v : NONE
  } catch {
    return NONE
  }
}

/** Records the server's answer (also used by tests and stories). */
export function setSpeechService(s: SpeechService): void {
  const next = s.connected ? { connected: true, host: s.host } : NONE
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* memory only */ }
  store.set(next)
}

let inflight: Promise<void> | null = null

/** Asks the server once per page load; offline keeps the remembered answer. */
export function refreshSpeechService(): Promise<void> {
  inflight ??= api.me().then((me) => setSpeechService(me.speech ?? NONE)).catch(() => undefined)
  return inflight
}

/** The speech service as this device knows it; asks the server once when `refresh` (the default). */
export function useSpeechService(refresh = true): SpeechService {
  useEffect(() => { if (refresh) void refreshSpeechService() }, [refresh])
  return store.use()
}

/** The current answer without subscribing. */
export const speechService = store.get

/** Whether this browser can record a phrase for the server's service. */
export function canRecord(win: unknown = globalThis): boolean {
  const w = win as { MediaRecorder?: unknown; navigator?: { mediaDevices?: { getUserMedia?: unknown } } }
  return typeof w.MediaRecorder === 'function' && typeof w.navigator?.mediaDevices?.getUserMedia === 'function'
}
