// Wire types of the in-app assistant routes (OpenSpec `in-app-assistant`).
import type { Entity } from './types'

export type ProviderName = 'anthropic' | 'openai' | 'gemini' | 'compatible'
export const PROVIDERS: ProviderName[] = ['anthropic', 'openai', 'gemini', 'compatible']

export interface ProviderView {
  enabled: boolean
  model: string
  key_set: boolean
  label: string
  base_url?: string
}

/** The owner's view of GET/PUT /api/v1/settings/assistant: presence flags, never keys. */
export interface AssistantOwnerSettings {
  enabled: boolean
  active: boolean
  providers: Record<ProviderName, ProviderView>
  default_provider: ProviderName
  allow_member_keys: boolean
  monthly_token_cap_per_user: number
  allow_private_endpoint: boolean
  anthropic_models: string[]
  default_model: string
}

/** What a member reads from the same route. */
export interface AssistantMemberSettings {
  enabled: boolean
  provider: ProviderName
  provider_label: string
  model: string
  allow_member_keys: boolean
  monthly_token_cap_per_user: number
}

export interface AssistantSettingsInput {
  enabled?: boolean
  providers?: Partial<Record<ProviderName, { enabled: boolean; model: string; base_url?: string }>>
  default_provider?: ProviderName
  allow_member_keys?: boolean
  monthly_token_cap_per_user?: number
  allow_private_endpoint?: boolean
  /** A value sets the key, "" clears it, absent keeps it. */
  keys?: Partial<Record<ProviderName, string>>
}

export interface AssistantTestResult {
  ok: boolean
  code?: string
  message?: string
  status?: number
}

export interface AssistantUsage {
  month: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
  turns: number
  cap: number
  resets_at: string
}

/** One proposed entity change (agenttools.Change plus the shared mark). */
export interface ProposedChange {
  entity: Entity
  entityId: string
  create?: boolean
  patch: Record<string, unknown>
  base?: Record<string, unknown>
  shared?: boolean
}

export type TurnEvent =
  | { type: 'text'; text: string }
  | { type: 'status'; text: string }
  | { type: 'changeset'; items: ProposedChange[]; limit: number }
  | { type: 'usage'; input: number; output: number; month_total: number; cap: number }
  | { type: 'done'; stop_reason: string; message?: string; server_time?: string }
  | { type: 'error'; code: string; message: string }

export function isOwnerSettings(s: AssistantOwnerSettings | AssistantMemberSettings | null): s is AssistantOwnerSettings {
  return !!s && 'providers' in s
}
