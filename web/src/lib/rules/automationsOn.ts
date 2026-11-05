// Whether automation rules run on this server (OpenSpec change
// section-rule-and-sub-projects, design D2): the owner's switch as GET /api/v1/me
// reports it, remembered on this device, so the menus that offer "Make an
// automation rule" hide it the same offline. Unknown reads as off.
import { api } from '../api'
import { readJSON, writeJSON } from '../deviceStorage'
import { createStore } from '../store'

const KEY = 'opentodo.automations-on'

const store = createStore<boolean>('automationsOn', read())

function read(): boolean {
  return readJSON<boolean>(KEY, false, (v) => (typeof v === 'boolean' ? v : null))
}

/** Records the server's answer (also used by tests and stories). */
export function setAutomationsOn(on: boolean): void {
  writeJSON(KEY, on) // storage refused: memory only
  store.set(on)
}

/** Fetches the server's answer and remembers it; offline keeps the last one. */
export async function refreshAutomationsOn(): Promise<void> {
  try {
    const me = await api.me()
    if (me.automations) setAutomationsOn(me.automations.enabled === true)
  } catch {
    // Offline or signed out: the remembered answer stays.
  }
}

/** The current answer without subscribing. */
export const automationsOn = store.get

/** Whether rules can be made here, live. */
export const useAutomationsOn = store.use
