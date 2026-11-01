// Automation rules on this device (OpenSpec change automation-rules, D1): every
// write is an op through mutate, so a rule saved offline is listed at once and
// reaches the server on the next sync. The server runs rules; the device only
// lists and edits them.
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { t } from '../i18n'
import { uuid } from '../ids'
import { mutate, mutateMany } from '../ops'
import { RULE_TRIGGERS, type Rule, type RuleActions, type RuleCondition, type RuleTrigger, type RoutineStep } from '../types'
import { parseSteps } from './steps'

/** At most this many live rules per account (spec "Limits"). */
export const MAX_RULES = 50

const CONDITION_KEYS = ['project', 'section', 'labels', 'priority', 'due', 'deadline', 'start', 'evening', 'blocked', 'assignee', 'origin', 'habit', 'estimate', 'tracked']
const ACTION_KEYS = ['add_labels', 'remove_labels', 'priority', 'due', 'start', 'state', 'section', 'deadline', 'assignee', 'comment', 'notify', 'webhook']

const keysOf = (v: unknown): string[] => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v) : [])

/**
 * Whether this build understands every part of a rule. A rule made with a newer
 * version is listed as such and offers only its switch and deletion; its unknown
 * keys stay because the trigger, condition and actions are only ever written whole
 * from an editor that understood them.
 */
export function isKnownRule(r: Pick<Rule, 'trigger' | 'condition' | 'actions' | 'steps'>): boolean {
  const kind = (r.trigger as { kind?: unknown } | null)?.kind
  if (!RULE_TRIGGERS.includes(kind as RuleTrigger['kind'])) return false
  if (!keysOf(r.condition).every((k) => CONDITION_KEYS.includes(k))) return false
  // A routine (routines-editor): every step of a kind this build knows.
  if (r.steps !== null && r.steps !== undefined) {
    try {
      parseSteps(r.steps)
      return true
    } catch {
      return false
    }
  }
  const actions = keysOf(r.actions)
  return actions.length > 0 && actions.every((k) => ACTION_KEYS.includes(k))
}

/** Live rules in list order. */
export function activeRules(rules: Rule[]): Rule[] {
  return rules.filter((r) => !r.deleted_at).sort((a, b) => a.position - b.position || a.created_at - b.created_at || (a.id < b.id ? -1 : 1))
}

async function liveRules(): Promise<Rule[]> {
  return activeRules(await db.rules.toArray())
}

/** The live rules (routines) in list order, read once (the palette's Run routine…). */
export const listRules = liveRules

export interface NewRule {
  name: string
  trigger: RuleTrigger
  condition?: RuleCondition | null
  /** Null for a routine with steps (routines-engine D2). */
  actions: RuleActions | null
  /** A routine's steps; null or absent keeps the rule form. */
  steps?: RoutineStep[] | null
  enabled?: boolean
  /** Apply without asking and the daily AI budget (routines-ai-step). */
  ai_apply?: string
  ai_budget?: number
}

function checkParts(name: string, actions: RuleActions | null | undefined, steps?: RoutineStep[] | null): void {
  if (!name) throw new Error(t('A rule needs a name'))
  if (steps) {
    parseSteps(steps)
    return
  }
  if (actions !== undefined && keysOf(actions).length === 0) throw new Error(t('A rule needs at least one action'))
}

/** Create a rule, last in the list and on unless told otherwise. Refuses the 51st. */
export async function createRule(input: NewRule): Promise<string> {
  const name = input.name.trim()
  checkParts(name, input.actions, input.steps)
  const live = await liveRules()
  if (live.length >= MAX_RULES) throw new Error(t('You can have at most {n} rules', { n: MAX_RULES }))
  const id = uuid()
  const now = Date.now()
  let position = now
  for (const r of live) if (r.position >= position) position = r.position + 1
  await mutate('rule', id, {
    name,
    enabled: input.enabled ?? true,
    trigger: input.trigger,
    condition: input.condition ?? null,
    actions: input.steps ? null : input.actions,
    ...(input.steps ? { steps: input.steps } : {}),
    ...(input.ai_apply ? { ai_apply: input.ai_apply } : {}),
    ...(input.ai_budget ? { ai_budget: input.ai_budget } : {}),
    position,
    created_at: now,
    deleted_at: null,
  })
  return id
}

export type RulePatch = Partial<Pick<Rule, 'name' | 'enabled' | 'trigger' | 'condition' | 'actions' | 'steps' | 'ai_budget'>>

/**
 * Turns Apply without asking on or off (routines-ai-step D4, D5): always one
 * new op, so turning it on again after the server fell back to proposals is
 * newer than the fallback and resumes auto mode. Only the person does this, in
 * the app; agent paths refuse it.
 */
export async function setApplyWithoutAsking(id: string, on: boolean): Promise<void> {
  const rule = await db.rules.get(id)
  if (!rule || rule.deleted_at) throw new Error(t('Rule not found'))
  await mutate('rule', id, { ai_apply: on ? 'auto' : '' })
}

/** Edit a rule: one op per changed field, each part written whole. */
export async function updateRule(id: string, patch: RulePatch): Promise<void> {
  const rule = await db.rules.get(id)
  if (!rule || rule.deleted_at) throw new Error(t('Rule not found'))
  const next: Record<string, unknown> = {}
  const row = rule as unknown as Record<string, unknown>
  for (const [k, v] of Object.entries(patch)) if (JSON.stringify(row[k] ?? null) !== JSON.stringify(v ?? null)) next[k] = v
  if (typeof next.name === 'string') next.name = next.name.trim()
  const steps = 'steps' in next ? (next.steps as RoutineStep[] | null) : rule.steps ?? null
  checkParts(typeof next.name === 'string' ? next.name : rule.name, steps ? undefined : (next.actions as RuleActions | undefined), steps)
  if (Object.keys(next).length === 0) return
  await mutate('rule', id, next)
}

/** Turn a rule on or off. */
export const setRuleEnabled = (id: string, enabled: boolean): Promise<void> => updateRule(id, { enabled })

/** A copy of a rule, off, last in the list. */
export async function duplicateRule(id: string): Promise<string> {
  const rule = await db.rules.get(id)
  if (!rule || rule.deleted_at) throw new Error(t('Rule not found'))
  const copy = await createRule({
    name: t('{name} (copy)', { name: rule.name }),
    trigger: rule.trigger as RuleTrigger,
    condition: rule.condition as RuleCondition | null,
    actions: rule.actions as RuleActions | null,
    steps: rule.steps ?? null,
    enabled: false,
  })
  return copy
}

/** Move a rule one step up (-1) or down (+1). Swaps two positions in one batch. */
export async function reorderRule(id: string, delta: -1 | 1): Promise<void> {
  const list = await liveRules()
  const i = list.findIndex((r) => r.id === id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= list.length) return
  const a = list[i], b = list[j]
  const pa = a.position === b.position ? b.position + delta : b.position
  await mutateMany([
    { entity: 'rule', entityId: a.id, patch: { position: pa } },
    { entity: 'rule', entityId: b.id, patch: { position: a.position } },
  ])
}

/** Tombstone a rule; its run log stays on the server until pruned. */
export async function deleteRule(id: string): Promise<void> {
  await mutate('rule', id, { deleted_at: Date.now() })
}

const NO_RULES: Rule[] = []
const NO_TITLES = new Map<string, string>()

/** The live rules of this device, in order (the Rules page). */
export function useRules(): Rule[] {
  return useLiveQuery(async () => activeRules(await db.rules.toArray()), [], NO_RULES)
}

/** One live rule: undefined while loading, null when it does not exist or was deleted (the editor page). */
export function useRule(id: string | undefined): Rule | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null
    const r = await db.rules.get(id)
    return r && !r.deleted_at ? r : null
  }, [id], undefined)
}

/** Titles of the live tasks among ids (a rule's history): a deleted task has none. */
export function useTaskTitles(ids: readonly string[]): Map<string, string> {
  return useLiveQuery(async () => new Map((await db.tasks.bulkGet([...ids])).flatMap((x) => (x && !x.deleted_at ? [[x.id, x.title] as const] : []))), [ids.join()], NO_TITLES)
}
