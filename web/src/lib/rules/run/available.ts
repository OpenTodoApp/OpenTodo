// Step availability (internal/ruleval/available.go Available, StepAvailable):
// whether a step can run for the user now, and why not.
import type { RoutineStep } from '../../types'
import { stepKind } from '../steps'
import type { RunEnv } from './types'

const on = (v: boolean | undefined, def = true) => v ?? def

/** The reason a step cannot run, or '' when it can. */
export function unavailableReason(s: RoutineStep, env: RunEnv, encrypted: boolean): string {
  const k = stepKind(s.kind)
  if (!k) return ''
  if (!on(env.automations)) return 'automations_off'
  switch (k.needs) {
    case 'email':
    case 'shared':
      if (env.demo) return 'demo'
      if (!on(env.emailConfigured)) return 'email_not_configured'
      if (encrypted) return 'encrypted'
      if (!on(env.emailVerified)) return 'email_not_verified'
      if (k.needs === 'shared' && !env.shared) return 'not_shared'
      break
    case 'webhook':
      if (env.demo) return 'demo'
      if (env.webhooks && env.webhooks.length === 0) return 'no_webhook'
      break
    case 'time_tracking':
      if (env.timeTrackingOff) return 'time_tracking_off'
      break
    case 'focus':
      if (env.focusOff) return 'focus_off'
      break
    case 'ai':
      if (encrypted && !on(env.ai)) return 'ai_encrypted'
      if (!on(env.ai)) return 'ai_not_configured'
      if (!on(env.aiConsent)) return 'ai_no_consent'
      break
  }
  const lit = (name: string): unknown => { const a = s.in?.[name]; return a && 'literal' in a ? a.literal : undefined }
  switch (s.kind) {
    case 'webhook':
      if (env.webhooks && !env.webhooks.includes(lit('webhook_id') as string)) return 'no_webhook'
      // Its text would pass through the server in plaintext (routines-ai-step D7).
      if (encrypted && s.in?.text) return 'encrypted'
      break
    case 'change_tasks': {
      const set = lit('set') as Record<string, unknown> | undefined
      if (set && 'energy' in set && !on(env.energy)) return 'energy_off'
      break
    }
    case 'create_tasks':
      if (s.in && 'energy' in s.in && !on(env.energy)) return 'energy_off'
      break
  }
  return ''
}
