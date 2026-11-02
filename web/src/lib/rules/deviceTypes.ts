// The wire shapes of a device run (OpenSpec change routines-ai-step, D8): what
// a device commits for a routine it ran on its decrypted copy. Content values
// are ciphertext; the step records hold ids, counts, statuses and codes only.

/** One step of a device run, as the server records it (never text). */
export interface DeviceStepRecord {
  step_id: string
  kind: string
  status: 'ok' | 'skipped' | 'ended' | 'failed' | 'unavailable' | 'truncated'
  duration_ms?: number
  items?: number
  output?: string
  ids?: string[]
  error?: string
  tokens?: number
}

/** One entity the run writes: its fields, content fields sealed. */
export interface DeviceChange {
  entity: string
  id: string
  create?: boolean
  fields: Record<string, unknown>
}

/** A side effect: a Notify me (text sealed) or a Send a webhook without text. */
export type DeviceSide =
  | { kind: 'notify'; step: string; text?: string; task?: string }
  | { kind: 'fired'; task: string }
  | { kind: 'webhook'; step: string; webhook: string; tasks?: string[] }

export interface DeviceCommit {
  steps: DeviceStepRecord[]
  outcome?: 'applied' | 'already_matched' | 'ended'
  duration_ms?: number
  tokens?: number
  changes?: DeviceChange[]
  completing?: string[]
  sides?: DeviceSide[]
  /** A proposal run: one envelope holding the proposal's body, and its item count. */
  proposal?: { envelope: string; items: number }
}

/** Where an encrypted proposal's body is sealed: bound to its run. */
export const PROPOSAL_BINDING = { entity: 'routine_proposal', field: 'body' } as const

/** Where a device run's Notify me text is sealed: bound to the run and the step. */
export const NOTICE_BINDING = { entity: 'routine_notice' } as const
