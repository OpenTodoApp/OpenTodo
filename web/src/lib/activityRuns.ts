// Activity runs for the task panel's Activity tab (OpenSpec task-detail-redesign,
// design D6; activity-log "Grouped activity runs"). Presentation only: events are
// never changed, only folded into runs of consecutive events by one actor on one
// task, each within the window of the previous one. Comment events stay single.
import type { ActivityEvent, ActivityKind } from './types'

export const RUN_WINDOW_MS = 10 * 60_000

const COMMENT_KINDS: ReadonlySet<ActivityKind> = new Set(['commented', 'comment_edited', 'comment_deleted'])

export interface ActivityRun {
  /** The id of the run's newest event (stable as older events join). */
  id: string
  /** 'comment' runs always hold exactly one comment event. */
  type: 'changes' | 'comment'
  actor: string
  /** Newest first, as given. */
  events: ActivityEvent[]
  /** Newest and oldest event time. */
  ts: number
  firstTs: number
  /** Some event of the run is still waiting in the outbox. */
  pending: boolean
}

const taskOf = (ev: ActivityEvent) => ev.taskId ?? ev.entityId

/**
 * Folds a newest-first event list into runs. An event joins the current run when
 * it has the same actor and task, neither is a comment event, and it is at most
 * `windowMs` older than the run's oldest event so far.
 */
export function groupRuns(events: readonly ActivityEvent[], opts: { windowMs?: number; pending?: ReadonlySet<string> } = {}): ActivityRun[] {
  const windowMs = opts.windowMs ?? RUN_WINDOW_MS
  const pending = opts.pending
  const out: ActivityRun[] = []
  for (const ev of events) {
    const isComment = COMMENT_KINDS.has(ev.kind)
    const last = out[out.length - 1]
    const joins = last && last.type === 'changes' && !isComment && last.actor === ev.actor
      && taskOf(last.events[0]) === taskOf(ev) && last.firstTs - ev.ts <= windowMs
    const evPending = !!pending && ev.opIds.some((id) => pending.has(id))
    if (joins) {
      last.events.push(ev)
      last.firstTs = Math.min(last.firstTs, ev.ts)
      last.pending ||= evPending
    } else {
      out.push({ id: ev.id, type: isComment ? 'comment' : 'changes', actor: ev.actor, events: [ev], ts: ev.ts, firstTs: ev.ts, pending: evPending })
    }
  }
  return out
}

// One summary part per kind of change, in a fixed precedence. A verb part reads on
// its own ("renamed the task"); noun parts are gathered into "changed the …".
type Part = { order: number; verb?: string; noun?: string }

const FIELD_NOUNS: Record<string, [number, string]> = {
  due: [3, 'due date'], project_id: [4, 'project'], priority: [5, 'priority'], assignee_id: [6, 'assignee'], labels: [7, 'labels'],
  description: [8, 'notes'], notes_doc: [8, 'notes'], estimate_minutes: [8, 'estimate'], recurrence: [8, 'repeat rule'],
  parent_id: [8, 'parent task'], section_id: [8, 'section'], position: [9, 'order'],
}

function partsOf(ev: ActivityEvent): Part[] {
  switch (ev.kind) {
    case 'created': return [{ order: 0, verb: 'created the task' }]
    case 'completed': return [{ order: 1, verb: 'completed the task' }]
    case 'reopened': return [{ order: 1, verb: 'reopened the task' }]
    case 'deleted': return [{ order: 1, verb: 'deleted the task' }]
    case 'restored': return [{ order: 1, verb: 'restored the task' }]
    case 'rescheduled': return [{ order: 3, noun: 'due date' }]
    case 'moved': return [{ order: 4, verb: 'moved the task' }]
    case 'assigned': case 'unassigned': return [{ order: 6, noun: 'assignee' }]
    default: {
      const parts: Part[] = []
      for (const c of ev.changes) {
        if (c.field === 'title') parts.push({ order: 2, verb: 'renamed the task' })
        else if (FIELD_NOUNS[c.field]) parts.push({ order: FIELD_NOUNS[c.field][0], noun: FIELD_NOUNS[c.field][1] })
      }
      return parts.length ? parts : [{ order: 10, verb: 'edited the task' }]
    }
  }
}

const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

/**
 * The run's sentence, e.g. "You renamed the task and changed the due date and
 * priority". At most three changes are named; the rest read "and N more".
 */
export function summarizeRun(run: ActivityRun, actorName: string): string {
  if (run.type === 'comment') {
    const kind = run.events[0].kind
    return `${actorName} ${kind === 'commented' ? 'commented' : kind === 'comment_edited' ? 'edited a comment' : 'deleted a comment'}`
  }
  const seen = new Set<string>()
  const parts = run.events.flatMap(partsOf).filter((p) => {
    const k = p.verb ?? `n:${p.noun}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  }).sort((a, b) => a.order - b.order)
  const shown = parts.slice(0, 3)
  const more = parts.length - shown.length
  const verbs = shown.filter((p) => p.verb).map((p) => p.verb!)
  const nouns = shown.filter((p) => p.noun).map((p) => p.noun!)
  const clauses = [...verbs]
  if (nouns.length) clauses.push(`changed the ${list(nouns)}`)
  let text = clauses.length > 1 ? `${clauses.slice(0, -1).join(', ')} and ${clauses[clauses.length - 1]}` : clauses[0]
  if (more > 0) text += ` and ${more} more`
  return `${actorName} ${text}`
}
