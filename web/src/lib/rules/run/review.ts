// What a plan becomes (internal/rules routine_run.go mergeChanges,
// routine_ai.go autoCheck, routine_proposal.go proposalItems): the changes
// merged per entity, whether auto mode may write them, and the reviewable
// items of a proposal.
import { OP_DEFAULTS } from '../../../generated/opSchema'
import { autoBlocker, MAX_AUTO_ITEMS } from '../steps'
import { isNull } from './actions'
import type { Change, MergedChange, ProposalItem, Row, RunPlan, RunRoutine, RunWorld } from './types'

/** One entry per entity in plan order, its patches merged. */
export function mergeChanges(cs: readonly Change[]): MergedChange[] {
  const idx = new Map<string, number>()
  const out: MergedChange[] = []
  for (const c of cs) {
    const k = `${c.entity}\x00${c.entityId}`
    let i = idx.get(k)
    if (i === undefined) {
      i = out.length
      idx.set(k, i)
      out.push({ entity: c.entity, id: c.entityId, create: false, patch: {} })
    }
    out[i].create = out[i].create || !!c.create
    Object.assign(out[i].patch, c.patch)
  }
  return out
}

const str = (r: Row | undefined, f: string) => (typeof r?.[f] === 'string' ? (r[f] as string) : '')
const find = (rows: readonly Row[], id: string) => rows.find((r) => str(r, 'id') === id)

/** A changed task's patch sets only what auto mode allows: labels only added, a section of its own project. */
function autoTaskPatch(w: RunWorld, patch: Record<string, unknown>, base: Row | undefined): boolean {
  for (const [f, v] of Object.entries(patch)) {
    switch (f) {
      case 'priority': case 'due': case 'start': case 'deadline': case 'energy':
        break
      case 'labels': {
        const before = Array.isArray(base?.labels) ? (base!.labels as string[]) : []
        const after = Array.isArray(v) ? (v as string[]) : []
        if (before.some((l) => !after.includes(l))) return false
        break
      }
      case 'section_id':
        if (typeof v === 'string' && str(find(w.sections, v), 'project_id') !== str(base, 'project_id')) return false
        break
      case 'position':
        if (!('section_id' in patch)) return false
        break
      default:
        return false
    }
  }
  return true
}

/**
 * What an auto run's plan may not do (D4): '' when it may be written without
 * asking, 'limit' past 20 items, 'disallowed_write' for a write auto mode does not allow.
 */
export function autoCheck(w: RunWorld, r: RunRoutine, plan: RunPlan): '' | 'limit' | 'disallowed_write' {
  if (autoBlocker(r.steps)) return 'disallowed_write'
  if (plan.changes.length > MAX_AUTO_ITEMS) return 'limit'
  for (const m of plan.changes) {
    switch (m.entity) {
      case 'task':
        if (m.create) continue
        if (plan.completing.includes(m.id) || !autoTaskPatch(w, m.patch, find(w.tasks, m.id))) return 'disallowed_write'
        break
      case 'comment': case 'label':
        if (!m.create) return 'disallowed_write'
        break
      default:
        return 'disallowed_write'
    }
  }
  return ''
}

const TEXT_FIELDS = ['title', 'description', 'body', 'name', 'content', 'text']

function aiIn(aiTexts: readonly string[], text: string): boolean {
  if (!text) return false
  return aiTexts.some((a) => { const x = a.trim(); return !!x && (text.includes(x) || x.includes(text)) })
}

function baseRow(w: RunWorld, entity: string, id: string): Row | undefined {
  switch (entity) {
    case 'task': return find(w.tasks, id)
    case 'project': return find(w.projects, id)
    case 'label': return find(w.labels, id)
    case 'section': return find(w.sections, id)
    case 'time_entry': return find(w.timeEntries, id)
    case 'user_prefs': return w.prefs
  }
  return undefined
}

/** The plan for review: one item per created or changed entity in plan order, then one per side effect. */
export function proposalItems(w: RunWorld, plan: RunPlan): ProposalItem[] {
  const out: ProposalItem[] = []
  for (const m of plan.changes) {
    const it: ProposalItem = { key: `e:${m.entity}:${m.id}`, kind: m.create ? 'create' : 'change', entity: m.entity, id: m.id, fields: m.patch, ai: false }
    if (!m.create) {
      const base = baseRow(w, m.entity, m.id)
      const defaults = (OP_DEFAULTS as Record<string, Record<string, unknown>>)[m.entity] ?? {}
      it.before = {}
      for (const f of Object.keys(m.patch)) it.before[f] = base && f in base && base[f] !== undefined ? base[f] : (f in defaults ? defaults[f] : null)
    }
    it.ai = TEXT_FIELDS.some((f) => typeof m.patch[f] === 'string' && aiIn(plan.aiTexts, m.patch[f] as string))
    out.push(it)
  }
  plan.sides.forEach((sp, i) => {
    const it: ProposalItem = { key: `s:${i}`, kind: sp.kind === 'fired' ? 'notify' : sp.kind, side: sp, ai: false }
    if (sp.notice) it.ai = aiIn(plan.aiTexts, sp.notice.text)
    else if (sp.mail) it.ai = aiIn(plan.aiTexts, sp.mail.Subject) || aiIn(plan.aiTexts, sp.mail.Text)
    else if (sp.delivery && sp.delivery.Text !== null) it.ai = aiIn(plan.aiTexts, sp.delivery.Text)
    out.push(it)
  })
  return out.slice(0, 500)
}

export { isNull }
