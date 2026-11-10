// The relay's wire types (OpenSpec changes mcp-device-relay and routines-ai-step).
// Types only, so lib/api.ts, which the native app shares (native-app-foundation
// D2), names them without lib/relay.ts.

export interface RelayDevice {
  deviceId: string
  label: string
  enabledAt: number
  online: boolean
  thisSession: boolean
  /** routines-ai-step D7: the device's opt-ins, its own stream and what it announced. */
  mcp?: boolean
  routines?: boolean
  connected?: boolean
  capabilities?: string[]
}

/** A routine.run request (ids and numbers only, routines-ai-step D7). */
export interface RoutineRunRequest {
  op: 'routine.run'
  rule: string
  run: string
  occurrence: string
  at: number
  task?: string
  rev: string
  auto: boolean
  tokens: number
  budget: number
}
