// Routines' AI steps on the device (OpenSpec change routines-ai-step, design
// D11 and D12): the token estimate a card and Test show before anything is
// sent, and the words of Apply without asking and its fallback. The estimate
// follows internal/assistant.EstimateTokens: the characters sent divided by
// four, plus the answer's maximum. Pure: no reads, no writes.
import { msg, t, translatedMap } from '../i18n'
import type { RoutineStep } from '../types'
import { aiAnswer, autoBlocker, hasAI, MAX_AUTO_ITEMS } from './steps'

/** About the characters of the fixed instructions every routine call sends. */
const FIXED_CHARS = 1100

/** The answer maxima (tokens), as the server's. */
const MAX_TOKENS = { text: 1000, lines: 2000, short: 200, medium: 400 }

/** An AI step's answer maximum. */
export function aiMaxTokens(s: RoutineStep): number {
  if (s.kind === 'summarise') return s.in?.length && 'literal' in s.in.length && s.in.length.literal === 'medium' ? MAX_TOKENS.medium : MAX_TOKENS.short
  return aiAnswer(s) === 'lines' ? MAX_TOKENS.lines : MAX_TOKENS.text
}

/** A call's expected tokens from the characters of its instruction and material. */
export function estimateTokens(chars: number, maxTokens: number): number {
  return Math.ceil((chars + FIXED_CHARS) / 4) + maxTokens
}

/** Rounds an estimate for people ("about 3,500 tokens"): to 100 above 1,000. */
export const roundEstimate = (n: number): number => (n >= 1000 ? Math.round(n / 100) * 100 : Math.round(n / 10) * 10)

/** The default and the bounds of the daily budget (D11). */
export const DEFAULT_AI_BUDGET = 20000
export const MIN_AI_BUDGET = 1000
export const MAX_AI_BUDGET = 200000

/** The budget a stored value means: 0 (or out of range) is the default. */
export const budgetOf = (v: number | undefined): number => (v && v >= MIN_AI_BUDGET && v <= MAX_AI_BUDGET ? v : DEFAULT_AI_BUDGET)

const WHAT = translatedMap<string>({
  complete_tasks: msg('Turn this off to complete tasks: Apply without asking only adds and sets fields'),
  trash_tasks: msg('Turn this off to move tasks to the Trash: Apply without asking only adds and sets fields'),
  remove_labels: msg('Turn this off to remove labels: Apply without asking only adds and sets fields'),
  assign: msg('Turn this off to assign tasks: Apply without asking only adds and sets fields'),
  projects: msg('Turn this off to change projects: Apply without asking only adds and sets fields'),
  notes: msg('Turn this off to change notes: Apply without asking only adds and sets fields'),
  focus: msg('Turn this off to set today’s focus: Apply without asking only adds and sets fields'),
  timers: msg('Turn this off to start or stop timers: Apply without asking only adds and sets fields'),
  email_members: msg('Turn this off to email project members: Apply without asking only adds and sets fields'),
})

/**
 * Why Apply without asking cannot be on for these steps, or '' when it can:
 * a routine without AI steps has nothing to apply; a step outside the allowed
 * writes names what it does.
 */
export function autoReason(steps: RoutineStep[]): string {
  if (!hasAI(steps)) return t('Add an Ask AI or Summarise step first')
  const b = autoBlocker(steps)
  return b ? WHAT[b.what] ?? WHAT.projects : ''
}

const FALLBACK: Record<string, string> = {
  limit: msg('Apply without asking was turned off after a run that would have written more than {n} items'),
  failures: msg('Apply without asking was turned off after two failed runs in a row'),
  disallowed_write: msg('Apply without asking was turned off after a run that would have made a change it does not allow'),
  agent: msg('Apply without asking was turned off because an AI assistant changed this routine'),
}

/** The fallback notice ("Apply without asking was turned off after …"), or ''. */
export function fallbackText(reason: string | undefined): string {
  return reason && FALLBACK[reason] ? t(FALLBACK[reason], { n: MAX_AUTO_ITEMS }) : ''
}
