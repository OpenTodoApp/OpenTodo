// Describe it (OpenSpec change routines-describe-it): the assistant drafts a
// routine from one sentence and the editor opens it unsaved. This file is the
// light part both paths share: the answer's shape, the names sent as context,
// and the draft as the editor's draft. The server path is one request
// (POST /api/v1/assistant/routine-draft); an encrypted account drafts on this
// device (describeDevice.ts, loaded on use) and nothing reaches the server.
import { RULE_TRIGGERS, type Label, type Project, type RoutineStep, type RuleCondition, type RuleTrigger, type Section, type View, type Webhook } from '../types'
import type { RoutineDraft } from './draft'
import { stepKind } from './steps'

/** The most characters of the sentence (design D2). */
export const MAX_DRAFT_TEXT = 500

/** A container the model may name by id; `project` is a section's project. */
export interface DraftName { id: string; name: string; project?: string }

/** The user's containers sent as untrusted context (D2, D6), in this key order. */
export interface DraftNames {
  projects: DraftName[]
  sections: DraftName[]
  labels: DraftName[]
  views: DraftName[]
  webhooks: DraftName[]
}

/** One reason a draft does not check. */
export interface DraftProblem { step?: string; input?: string; code: string; message: string }

/** A drafted routine in the engine's JSON. */
export interface DraftedRoutine {
  name: string
  trigger: RuleTrigger
  condition: RuleCondition | null
  steps: RoutineStep[]
}

/** The answer of a draft, from the server or this device. */
export interface DraftAnswer {
  draft: DraftedRoutine | null
  /** The model's sentence for the person (what it could not do), or its words when it drafted nothing. */
  note: string
  errors: DraftProblem[]
  warnings?: { step: string; kind: string; reason: string; message: string }[]
  usage?: { input: number; output: number; month_total: number; cap: number; own_key: boolean }
}

/** A webhook by its host only: its address may hold a secret. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/** The names a draft may use, from this device's data (live projects that are not archived). */
export function draftNamesOf(n: { projects: readonly Project[]; sections: readonly Section[]; labels: readonly Label[]; views: readonly View[]; webhooks: readonly Webhook[] | null }): DraftNames {
  const live = n.projects.filter((p) => !p.archived && !p.deleted_at)
  const ids = new Set(live.map((p) => p.id))
  return {
    projects: live.map((p) => ({ id: p.id, name: p.name })),
    sections: n.sections.filter((s) => ids.has(s.project_id) && !s.deleted_at).map((s) => ({ id: s.id, name: s.name, project: s.project_id })),
    labels: n.labels.filter((l) => !l.deleted_at).map((l) => ({ id: l.id, name: l.name })),
    views: n.views.filter((v) => !v.deleted_at).map((v) => ({ id: v.id, name: v.name })),
    webhooks: (n.webhooks ?? []).filter((w) => w.enabled).map((w) => ({ id: w.id, name: hostOf(w.url) })),
  }
}

/**
 * A drafted routine as the editor's draft: never "apply without asking" and
 * the default AI budget (agents never turn that on; the person decides).
 */
export function editorDraftOf(d: DraftedRoutine): RoutineDraft {
  // What the editor cannot show is repaired, never guessed: an unknown trigger reads as Run by
  // hand, a condition that is not an object as none, and steps of unknown kinds are left out;
  // the rest keeps its errors, which the editor shows on their cards.
  const known = (list: unknown): RoutineStep[] => (Array.isArray(list) ? list : [])
    .filter((s): s is RoutineStep => !!s && typeof s === 'object' && typeof (s as RoutineStep).kind === 'string' && !!stepKind((s as RoutineStep).kind))
    .map((s) => ({ ...s, ...(s.then ? { then: known(s.then) } : {}), ...(s.otherwise ? { otherwise: known(s.otherwise) } : {}), ...(s.do ? { do: known(s.do) } : {}) }))
  const kind = (d.trigger as { kind?: unknown } | null)?.kind
  const trigger: RuleTrigger = RULE_TRIGGERS.includes(kind as RuleTrigger['kind']) ? d.trigger : { kind: 'manual' }
  const condition = d.condition && typeof d.condition === 'object' && !Array.isArray(d.condition) ? d.condition : null
  return { name: typeof d.name === 'string' ? d.name : '', trigger, condition, steps: known(d.steps), aiApply: '', aiBudget: 0 }
}
