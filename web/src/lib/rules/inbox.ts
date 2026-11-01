// The Inbox card "Routines since your last visit" (OpenSpec change
// routines-editor, design D10): the synced seen marker
// (user_prefs.routines_seen_at, never written smaller than held, last writer
// wins), the per-device baseline for the first use, the Hide successful runs
// setting, the card's lines grouped per routine, and the last answer cached
// for offline. The server decides which runs the card shows.
import { useLiveQuery } from 'dexie-react-hooks'
import { api } from '../api'
import { db } from '../db'
import { readJSON, writeJSON } from '../deviceStorage'
import { msg, t } from '../i18n'
import { mutate } from '../ops'
import type { RoutineInboxRun, Rule } from '../types'

import { hidesSuccesses, PREFS_ID, seenMarkerOf } from './inboxPrefs'

export { hidesSuccesses, seenMarkerOf, setHideSuccesses } from './inboxPrefs'

const BASELINE_KEY = 'routines.inboxBaseline'
const CACHE_KEY = 'routines.inbox'

/** At most this many lines; then "See all runs" (D10). */
export const MAX_LINES = 5

/** The card counts as seen after this long on screen (D10). */
export const SEEN_AFTER_MS = 2000

/** The account's marker and setting, live; undefined while loading. */
export function useRoutinesSeen(): { marker: number; hide: boolean } | undefined {
  return useLiveQuery(async () => {
    const row = await db.userPrefs.get(PREFS_ID)
    return { marker: seenMarkerOf(row), hide: hidesSuccesses(row) }
  }, [])
}

/** Moves the marker to `at` (a run's server time), never back: one synced op, offline included. */
export async function markRoutinesSeen(at: number): Promise<boolean> {
  const row = await db.userPrefs.get(PREFS_ID)
  if (!(at > seenMarkerOf(row))) return false
  await mutate('user_prefs', PREFS_ID, { routines_seen_at: at })
  return true
}

/**
 * The time after which successes are shown: the synced marker, or on a device
 * without one, the newest run of its first fetch (stored per device), so
 * earlier history does not flood the card after the upgrade.
 */
export function sinceOf(marker: number): number | null {
  if (marker > 0) return marker
  const base = readJSON<number | null>(BASELINE_KEY, null, (v) => (typeof v === 'number' ? v : null))
  return base
}

export interface InboxAnswer { at: number; runs: RoutineInboxRun[] }

/** Fetches the card's runs; the first fetch on a device without a marker sets the baseline. */
export async function fetchInbox(marker: number): Promise<InboxAnswer> {
  const since = sinceOf(marker)
  const res = await api.routineInbox(since ?? 0)
  let runs = res.runs
  if (since === null && res.seen_at === 0) {
    const newest = runs.reduce((m, r) => Math.max(m, r.at), 0)
    writeJSON(BASELINE_KEY, newest || Date.now())
    runs = runs.filter((r) => r.kind === 'failure')
  }
  const answer = { at: Date.now(), runs }
  writeJSON(CACHE_KEY, answer)
  return answer
}

/** The last answer on this device (offline). */
export const cachedInbox = (): InboxAnswer | null => readJSON<InboxAnswer | null>(CACHE_KEY, null, (v) => (v && typeof v === 'object' && Array.isArray((v as InboxAnswer).runs) ? (v as InboxAnswer) : null))

export interface InboxLine {
  ruleId: string
  name: string
  kind: 'failure' | 'success' | 'proposal'
  text: string
  /** The runs the line stands for, newest first. */
  runs: RoutineInboxRun[]
  /** The newest run's time. */
  at: number
  /** A result applied without asking: the line offers Undo (routines-ai-step D4). */
  auto?: boolean
}

const REASON: Record<string, string> = {
  email_not_configured: msg('outgoing email is not set up'),
  no_webhook: msg('the webhook is gone'),
}

/** What a group of successful runs did ("3 tasks created", "23 tasks moved"); "by AI" for results applied without asking. */
function didText(runs: readonly RoutineInboxRun[]): string {
  if (runs.some((r) => r.ai_auto)) return aiDidText(runs)
  let created = 0
  let changed = 0
  for (const r of runs) {
    for (const s of r.steps ?? []) {
      if (s.status !== 'ok') continue
      if (s.kind === 'create_tasks') created += s.items
      else if (s.kind === 'change_tasks') changed += s.items
    }
  }
  const writes = runs.reduce((n, r) => n + r.writes, 0)
  if (created) return t('{n, plural, one {# task created} other {# tasks created}}', { n: created })
  if (changed) return t('{n, plural, one {# task changed} other {# tasks changed}}', { n: changed })
  return t('{n, plural, one {# item written} other {# items written}}', { n: writes })
}

function aiDidText(runs: readonly RoutineInboxRun[]): string {
  let created = 0
  for (const r of runs) for (const s of r.steps ?? []) if (s.status === 'ok' && s.kind === 'create_tasks') created += s.items
  const writes = runs.reduce((n, r) => n + r.writes, 0)
  if (created) return t('{n, plural, one {# task created by AI} other {# tasks created by AI}}', { n: created })
  return t('{n, plural, one {# item written by AI} other {# items written by AI}}', { n: writes })
}

/** Why a failed run stopped ("Not available: outgoing email is not set up"). */
function failText(r: RoutineInboxRun): string {
  const step = r.steps?.find((s) => s.status === 'unavailable' || s.status === 'failed')
  if (step?.status === 'unavailable') return t('Not available: {reason}', { reason: REASON[step.error ?? ''] ? t(REASON[step.error ?? '']) : t('a step is not available') })
  if (r.failed_step >= 0) return t('failed at step {n}', { n: r.failed_step + 1 })
  return t('did not finish')
}

const ORDER: Record<InboxLine['kind'], number> = { proposal: 0, failure: 1, success: 2 }

/** One line per routine (D10): waiting proposals, then failures, then successes, newest first. */
export function inboxLines(runs: readonly RoutineInboxRun[], rules: readonly Pick<Rule, 'id' | 'name'>[], when: (at: number) => string): InboxLine[] {
  const names = new Map(rules.map((r) => [r.id, r.name]))
  const groups = new Map<string, { failure: RoutineInboxRun[]; success: RoutineInboxRun[]; proposal: RoutineInboxRun[] }>()
  for (const r of runs) {
    const g = groups.get(r.rule_id) ?? { failure: [], success: [], proposal: [] }
    ;(g[r.kind] ?? g.success).push(r)
    groups.set(r.rule_id, g)
  }
  const out: InboxLine[] = []
  for (const [ruleId, g] of groups) {
    const name = names.get(ruleId) || t('A deleted routine')
    if (g.proposal.length) {
      const last = g.proposal[0]
      const text = g.proposal.length === 1
        ? t('{name} · proposal waiting · Review', { name })
        : t('{name} · {n} proposals waiting · Review', { name, n: g.proposal.length })
      out.push({ ruleId, name, kind: 'proposal', runs: g.proposal, at: last.at, text })
    }
    if (g.failure.length) {
      const last = g.failure[0]
      out.push({ ruleId, name, kind: 'failure', runs: g.failure, at: last.at, text: t('{name} failed · {why}', { name, why: failText(last) }) })
    }
    if (g.success.length) {
      const last = g.success[0]
      const by = g.success.some((r) => r.source === 'mcp') ? ` · ${t('run by an AI assistant')}` : ''
      const text = g.success.length === 1
        ? `${name}${by} · ${didText(g.success)} · ${when(last.at)}`
        : `${t('{name} ran {n} times', { name, n: g.success.length })}${by} · ${didText(g.success)}`
      out.push({ ruleId, name, kind: 'success', runs: g.success, at: last.at, text, ...(last.ai_auto && !last.undone_at ? { auto: true } : {}) })
    }
  }
  return out.sort((a, b) => (a.kind === b.kind ? b.at - a.at : ORDER[a.kind] - ORDER[b.kind]))
}
