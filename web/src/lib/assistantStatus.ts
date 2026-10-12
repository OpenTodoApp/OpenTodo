// In-app assistant (OpenSpec change `in-app-assistant`): the part the main
// chunk carries, the status that decides whether the launcher and the Shift+I
// shortcut are offered, and the open/close signal. Everything else (panel,
// stream client, review, apply, undo) is in the lazy assistant chunk.
import { useSyncExternalStore } from 'react'
import { api, ApiError } from './api'
import { getMeta, setMeta } from './db'

/** GET /api/v1/me/assistant: what this account may do; never a key. */
export interface AssistantStatus {
  available: boolean
  /** The owner enabled the assistant with a provider. */
  enabled: boolean
  /** Why it is not available: off, no provider, an encrypted account, or the demo instance. */
  reason: '' | 'disabled' | 'no_provider' | 'encryption_enabled' | 'demo'
  provider: string
  provider_label: string
  model: string
  consented: boolean
  consent?: { accepted_at: number; disclosure_version: number; provider: string }
  disclosure_version: number
  /** What the disclosure says may be sent. */
  fields: string[]
  allow_member_keys: boolean
  own_key_set: boolean
  operator_key_set: boolean
}

const KEY = 'assistant.status'
let status: AssistantStatus | null = null
let open = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const DEMO_STATUS: AssistantStatus = {
  available: false, enabled: false, reason: 'demo', provider: '', provider_label: '', model: '', consented: false,
  disclosure_version: 0, fields: [], allow_member_keys: false, own_key_set: false, operator_key_set: false,
}

/** Fetches the status (cached on the device for offline launches; cleared at sign-out with meta). */
export async function refreshAssistantStatus(): Promise<AssistantStatus | null> {
  try {
    setAssistantStatus(await api.getMyAssistant())
  } catch (err) {
    if (err instanceof ApiError && err.code === 'demo_restricted') setAssistantStatus(DEMO_STATUS)
    else if (status === null) {
      try {
        status = await getMeta<AssistantStatus | null>(KEY, null)
        emit()
      } catch {
        // Offline and nothing cached: no launcher.
      }
    }
  }
  return status
}

export function setAssistantStatus(next: AssistantStatus): void {
  status = next
  emit()
  void setMeta(KEY, next).catch(() => {})
}

export function assistantStatus(): AssistantStatus | null {
  return status
}

export function useAssistantStatus(): AssistantStatus | null {
  return useSyncExternalStore(subscribe, () => status, () => status)
}

/**
 * The launcher and the shortcut are offered when the owner turned the
 * assistant on (an encrypted account gets them too, to read why it is
 * unavailable); never on a fresh server or the demo.
 */
export function showLauncher(s: AssistantStatus | null): boolean {
  return !!s && s.enabled && s.reason !== 'demo'
}

export function openAssistant(): void {
  open = true
  emit()
}

export function closeAssistant(): void {
  open = false
  emit()
}

export function useAssistantOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open, () => open)
}

/** Test hook. */
export function resetAssistantStatus(): void {
  status = null
  open = false
  emit()
}
