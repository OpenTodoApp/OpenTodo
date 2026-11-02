// The live preview of a routine draft (OpenSpec change routines-editor, design
// D4): text, list and logic steps, Find tasks by a condition and the writing
// steps' effects are planned on this device from local data (offline and on an
// encrypted account too: the device holds the plain text); other steps are
// previewed by POST /api/v1/rules/test while online. A preview never writes,
// sends or logs anything. Pure: the caller passes the data.
import { t } from '../i18n'
import type { Project, RoutineArg, RoutineStep, RoutineStepRecord, RuleCondition, Task } from '../types'
import { matchesCondition, type MatchContext } from './match'
import { aiMaxTokens, estimateTokens } from './ai'
import { dateLiteral, isAIKind, MAX_LIST_ITEMS, stepKind, textLiteral } from './steps'
import { filterLines, formatTemplate, holds, inFindScope, joinLines, projectScope, renderNumber, replaceText, resolveDate, sortLines, sortTasks, splitLines, take, type StepValue } from './stepData'
import type { RoutineDraft } from './draft'

export type Preview =
  | { state: 'value'; value: StepValue }
  /** A writing step: what it would do ("Would create 3 tasks in Errands"); over a limit when n > max. */
  | { state: 'effect'; text: string; n?: number; max?: number }
  /** Planned only on the server: online it is fetched, offline "Preview needs a connection". */
  | { state: 'server' }
  /** Not known here (inside a Repeat, after an unknown value). */
  | { state: 'unknown' }
  /** Not run: the other lane of an If. */
  | { state: 'skipped' }
  /** An AI step: the model is never called for a preview; about this many tokens when tested (routines-ai-step D11). */
  | { state: 'ai'; estimate: number }

export interface PreviewData {
  tasks: readonly Task[]
  projects: readonly Project[]
  today: string
  match: MatchContext
  matchTask: (t: Task) => Parameters<typeof matchesCondition>[1]
  /** The trigger's sample task (D4: the newest matching task), when the trigger has one. */
  triggerTask?: Task | null
}

/** At most this many items are listed on a card (D4). */
export const PREVIEW_ITEMS = 5

/** The per-run write limit a preview warns about. */
export const MAX_WRITES = 500

type Env = Map<string, StepValue | null>

function argOf(s: RoutineStep, name: string): RoutineArg | undefined {
  return s.in?.[name]
}

function litOf(s: RoutineStep, name: string): unknown {
  const a = argOf(s, name)
  return a && 'literal' in a ? a.literal : undefined
}

function renderValue(v: StepValue, data: PreviewData): string {
  switch (v.type) {
    case 'text': return v.text ?? ''
    case 'lines': return (v.lines ?? []).join('\n')
    case 'number': return renderNumber(v.number ?? 0)
    case 'date': return v.date ?? ''
    case 'task': return data.tasks.find((x) => x.id === v.id)?.title ?? ''
    case 'tasks': return (v.ids ?? []).map((id) => data.tasks.find((x) => x.id === id)?.title ?? '').join('\n')
    case 'project': return data.projects.find((p) => p.id === v.id)?.name ?? ''
  }
  return ''
}

/** A value input: the reference's value, or the literal as a value; undefined when unknown. */
function valueIn(s: RoutineStep, name: string, env: Env, data: PreviewData): StepValue | null | undefined {
  const a = argOf(s, name)
  if (!a) return undefined
  if ('ref' in a) return env.has(a.ref) ? env.get(a.ref) : null
  const def = stepKind(s.kind)?.inputs.find((d) => d.name === name)
  const lit = a.literal
  switch (def?.literal) {
    case 'text': {
      const tl = textLiteral(lit)
      if (!tl) return null
      if (!tl.template && s.kind !== 'format') return { type: 'text', text: tl.text }
      const vals: Record<string, string> = {}
      for (const m of tl.text.matchAll(/\{([a-z0-9]{1,8})\}/g)) {
        const v = env.get(m[1])
        if (v === undefined || v === null) return null
        vals[m[1]] = renderValue(v, data)
      }
      return { type: 'text', text: formatTemplate(tl.text, vals) }
    }
    case 'lines': return Array.isArray(lit) ? { type: 'lines', lines: lit as string[] } : null
    case 'number': return typeof lit === 'number' ? { type: 'number', number: lit } : null
    case 'date': { const d = dateLiteral(lit); return d ? { type: 'date', date: resolveDate(d, data.today) } : null }
    case 'task': return { type: 'task', id: (lit as { task?: string })?.task ?? '' }
    case 'project': return { type: 'project', id: (lit as { project?: string })?.project ?? '' }
  }
  return null
}

const asText = (v: StepValue, data: PreviewData): string => renderValue(v, data)

/** About the characters a value adds to an AI call: tasks carry due, priority, labels and project too. */
function materialChars(v: StepValue, data: PreviewData): number {
  const n = v.type === 'tasks' ? (v.ids ?? []).length : v.type === 'task' ? 1 : 0
  if (v.type === 'project') {
    const open = data.tasks.filter((x) => x.project_id === v.id && !x.completed_at && !x.deleted_at)
    return renderValue(v, data).length + open.reduce((sum, x) => sum + x.title.length + 40, 0)
  }
  return renderValue(v, data).length + n * 40
}

function noteOf(v: StepValue, data: PreviewData): string | null {
  if (v.type === 'task') return data.tasks.find((x) => x.id === v.id)?.description ?? null
  if (v.type === 'project') return data.projects.find((p) => p.id === v.id)?.description ?? null
  return null
}

/** Open tasks matching a condition, in the scope a run finds them (routines-find-scope D1): never the Trash, archived projects only when asked. */
function findTasks(cond: RuleCondition | null, data: PreviewData, limit?: number, archived = false): StepValue {
  const scope = projectScope(data.projects)
  const ids = data.tasks.filter((x) => !x.completed_at && inFindScope(x, scope, archived) && matchesCondition(cond, data.matchTask(x), data.match)).map((x) => x.id)
  return { type: 'tasks', ids: ids.slice(0, Math.min(limit || MAX_LIST_ITEMS, MAX_LIST_ITEMS)) }
}

const projectName = (s: RoutineStep, data: PreviewData): string => {
  const id = (litOf(s, 'project') as { project?: string } | undefined)?.project
  return (id && data.projects.find((p) => p.id === id)?.name) || ''
}

/** One step's local plan. */
function planStep(s: RoutineStep, env: Env, data: PreviewData): Preview {
  const v = (name: string) => valueIn(s, name, env, data)
  const value = (x: StepValue): Preview => ({ state: 'value', value: x })
  const unknownIf = (...xs: (StepValue | null | undefined)[]) => xs.some((x) => x === null)
  switch (s.kind) {
    case 'split_lines': {
      const x = v('text'); if (!x) return { state: x === null ? 'unknown' : 'server' }
      return value({ type: 'lines', lines: splitLines(asText(x, data), litOf(s, 'only') === 'open_checkboxes').lines })
    }
    case 'join': {
      const x = v('lines'); if (!x) return { state: 'unknown' }
      const sep = textLiteral(litOf(s, 'separator'))?.text ?? ''
      return value({ type: 'text', text: joinLines(x.lines ?? [], sep) })
    }
    case 'format': { const x = v('template'); return x ? value(x) : { state: 'unknown' } }
    case 'replace': {
      const x = v('text'); const find = textLiteral(litOf(s, 'find'))?.text ?? ''; const w = textLiteral(litOf(s, 'with'))?.text ?? ''
      if (!x) return { state: 'unknown' }
      return value({ type: 'text', text: replaceText(asText(x, data), find, w, litOf(s, 'case') === true) })
    }
    case 'count': {
      const x = v('list'); if (!x) return { state: 'unknown' }
      return value({ type: 'number', number: x.type === 'tasks' ? (x.ids ?? []).length : (x.lines ?? []).length })
    }
    case 'take': {
      const x = v('list'); const n = typeof litOf(s, 'n') === 'number' ? (litOf(s, 'n') as number) : 1
      if (!x) return { state: 'unknown' }
      if (litOf(s, 'from') === 'all') return value(x)
      const end = litOf(s, 'from') === 'end'
      return value(x.type === 'tasks' ? { type: 'tasks', ids: take(x.ids ?? [], n, end) } : { type: 'lines', lines: take(x.lines ?? [], n, end) })
    }
    case 'sort': {
      const x = v('list'); if (!x) return { state: 'unknown' }
      const desc = litOf(s, 'direction') === 'desc'
      if (x.type === 'lines') return value({ type: 'lines', lines: sortLines(x.lines ?? [], desc) })
      const rows = (x.ids ?? []).map((id) => data.tasks.find((t) => t.id === id)).filter((t): t is Task => !!t)
        .map((t) => ({ id: t.id, title: t.title, due: t.due?.date, deadline: t.deadline ?? undefined, priority: t.priority, created_at: t.created_at }))
      return value({ type: 'tasks', ids: sortTasks(rows, String(litOf(s, 'by') ?? 'due'), desc).map((r) => r.id) })
    }
    case 'filter': {
      const x = v('list'); const where = (litOf(s, 'where') ?? {}) as Record<string, unknown>
      if (!x) return { state: 'unknown' }
      if (x.type === 'lines') {
        const text = String(where.contains ?? where.not_contains ?? '')
        return value({ type: 'lines', lines: text ? filterLines(x.lines ?? [], text, 'not_contains' in where) : [...(x.lines ?? [])] })
      }
      const ids = (x.ids ?? []).filter((id) => { const t = data.tasks.find((y) => y.id === id); return !!t && matchesCondition(where as RuleCondition, data.matchTask(t), data.match) })
      return value({ type: 'tasks', ids })
    }
    case 'note_text': {
      const x = v('of'); if (!x) return { state: 'unknown' }
      // A list runs once per task: one line per task's note (routines-dynamic-data D1).
      if (x.type === 'tasks') return value({ type: 'lines', lines: (x.ids ?? []).map((id) => noteOf({ type: 'task', id }, data) ?? '') })
      const note = noteOf(x, data)
      return note === null ? { state: 'server' } : value({ type: 'text', text: note })
    }
    case 'get_task': { const x = v('task'); return x ? value(x) : { state: 'unknown' } }
    case 'project_of': {
      const x = v('task'); if (!x) return { state: 'unknown' }
      const task = data.tasks.find((y) => y.id === x.id)
      return task ? value({ type: 'project', id: task.project_id ?? '' }) : { state: 'server' }
    }
    case 'date': {
      if (!argOf(s, 'date')) return value({ type: 'date', date: data.today })
      const x = v('date'); return x ? value(x) : { state: 'unknown' }
    }
    case 'find_tasks': {
      if (argOf(s, 'condition')) return value(findTasks((litOf(s, 'condition') ?? null) as RuleCondition | null, data, litOf(s, 'limit') as number | undefined, litOf(s, 'archived') === true))
      return { state: 'server' }
    }
    case 'find_project': {
      const x = v('name'); if (!x) return { state: 'unknown' }
      const name = asText(x, data).trim().toLocaleLowerCase()
      const p = data.projects.find((y) => !y.deleted_at && !y.archived && y.name.trim().toLocaleLowerCase() === name)
      return value({ type: 'project', id: p?.id ?? '' })
    }
    case 'create_tasks': {
      const x = argOf(s, 'title') ? { type: 'text' as const, text: 'x' } : v('text')
      if (!x) return { state: 'unknown' }
      // Lines are counted past the list limit so the card can say "Would write 620 of 500".
      const n = argOf(s, 'title') ? 1 : x.type === 'lines' ? (x.lines ?? []).length : asText(x, data).split('\n').filter((l) => l.trim()).length
      const project = projectName(s, data)
      return { state: 'effect', n, max: MAX_WRITES, text: project
        ? t('{n, plural, one {Would create # task in {project}} other {Would create # tasks in {project}}}', { n, project })
        : t('{n, plural, one {Would create # task} other {Would create # tasks}}', { n }) }
    }
    case 'change_tasks': {
      const x = v('tasks'); if (!x) return { state: unknownIf(x) ? 'unknown' : 'server' }
      const n = x.type === 'task' ? (x.id ? 1 : 0) : (x.ids ?? []).length
      return { state: 'effect', n, max: MAX_WRITES, text: t('{n, plural, one {Would change # task} other {Would change # tasks}}', { n }) }
    }
    case 'notify': return { state: 'effect', text: t('Would notify you') }
    case 'email_me': return { state: 'effect', text: t('Would email you') }
    case 'email_members': return { state: 'effect', text: t('Would email the project’s members') }
    case 'webhook': return { state: 'effect', text: t('Would send the webhook') }
    case 'add_comment': {
      // One comment per task of a list (routines-dynamic-data D1).
      const x = v('task'); const n = x?.type === 'tasks' ? (x.ids ?? []).length : 1
      return { state: 'effect', n, max: MAX_WRITES, text: t('{n, plural, one {Would add # comment} other {Would add # comments}}', { n }) }
    }
    case 'append_to_note': {
      const x = v('of'); const n = x?.type === 'tasks' ? (x.ids ?? []).length : 1
      return { state: 'effect', n, max: MAX_WRITES, text: t('{n, plural, one {Would add to # note} other {Would add to # notes}}', { n }) }
    }
    case 'stop': return { state: 'effect', text: t('Would end the run here') }
    case 'ask_ai':
    case 'summarise': {
      let chars = s.kind === 'ask_ai' ? (textLiteral(litOf(s, 'instruction'))?.text ?? '').length : 60
      for (const name of s.kind === 'ask_ai' ? ['context', 'context2', 'context3'] : ['text']) {
        if (!argOf(s, name)) continue
        const x = v(name)
        if (!x) return { state: x === null ? 'unknown' : 'server' }
        chars += materialChars(x, data)
      }
      return { state: 'ai', estimate: estimateTokens(chars, aiMaxTokens(s)) }
    }
    case 'if':
    case 'repeat':
      return { state: 'unknown' }
  }
  return { state: 'server' }
}

/** The output a preview passes on to later steps (an effect's tasks are not known here). */
const outputOf = (p: Preview): StepValue | null => (p.state === 'value' ? p.value : null)

/** Plans a draft on this device: every step's preview, by step id. */
export function planDraft(d: RoutineDraft, data: PreviewData): Map<string, Preview> {
  const out = new Map<string, Preview>()
  const env: Env = new Map()
  if (data.triggerTask) env.set('trigger', { type: 'task', id: data.triggerTask.id })
  else if (d.trigger.kind === 'schedule' && d.condition) env.set('trigger', findTasks(d.condition, data))
  else if (d.trigger.kind === 'schedule') env.set('trigger', { type: 'date', date: data.today })
  else env.set('trigger', null)
  const skip = (list: readonly RoutineStep[]) => {
    for (const s of list) {
      out.set(s.id, { state: 'skipped' })
      skip(s.then ?? []); skip(s.otherwise ?? []); skip(s.do ?? [])
    }
  }
  const unknown = (list: readonly RoutineStep[]) => {
    for (const s of list) {
      out.set(s.id, { state: 'unknown' })
      env.set(s.id, null)
      unknown(s.then ?? []); unknown(s.otherwise ?? []); unknown(s.do ?? [])
    }
  }
  const walk = (list: readonly RoutineStep[]) => {
    for (const s of list) {
      if (s.kind === 'if') {
        const x = valueIn(s, 'value', env, data)
        const is = litOf(s, 'is') as Record<string, unknown> | undefined
        if (!x || !is) {
          out.set(s.id, { state: 'unknown' })
          unknown(s.then ?? []); unknown(s.otherwise ?? [])
          continue
        }
        const yes = holds(x, is)
        out.set(s.id, { state: 'effect', text: yes ? t('The test passes: Then runs') : t('The test fails: Otherwise runs') })
        walk(yes ? s.then ?? [] : s.otherwise ?? [])
        skip(yes ? s.otherwise ?? [] : s.then ?? [])
        continue
      }
      if (s.kind === 'repeat') {
        const x = valueIn(s, 'list', env, data)
        const n = x ? (x.type === 'tasks' ? (x.ids ?? []).length : (x.lines ?? []).length) : 0
        out.set(s.id, x ? { state: 'effect', text: t('{n, plural, one {Would run once} other {Would run # times}}', { n }) } : { state: 'unknown' })
        unknown(s.do ?? [])
        continue
      }
      const p = planStep(s, env, data)
      out.set(s.id, p)
      env.set(s.id, outputOf(p))
    }
  }
  walk(d.steps)
  return out
}

/** A server test's step record as a preview. */
export function serverPreview(r: RoutineStepRecord): Preview {
  const p = r.preview as unknown
  if (isAIKind(r.kind) && r.status === 'skipped') return { state: 'ai', estimate: r.estimate ?? 0 }
  switch (r.output) {
    case 'text': return { state: 'value', value: { type: 'text', text: typeof p === 'string' ? p : '' } }
    case 'lines': return { state: 'value', value: { type: 'lines', lines: Array.isArray(p) ? (p as string[]) : [] } }
    case 'number': return { state: 'value', value: { type: 'number', number: typeof p === 'number' ? p : 0 } }
    case 'date': return { state: 'value', value: { type: 'date', date: typeof p === 'string' ? p : '' } }
    case 'task': return { state: 'value', value: { type: 'task', id: (p as { id?: string } | null)?.id ?? '' } }
    case 'tasks': return { state: 'value', value: { type: 'tasks', ids: Array.isArray(p) ? (p as { id: string }[]).map((x) => x.id) : [] } }
    case 'project': return { state: 'value', value: { type: 'project', id: (p as { id?: string } | null)?.id ?? '' } }
  }
  return { state: 'effect', text: r.status === 'ok' ? t('Would run') : t('Would not run') }
}

/** Titles a server preview carries (tasks created by the test have no local row). */
export function serverTitles(records: readonly RoutineStepRecord[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const r of records) {
    const p = r.preview as unknown
    const list = Array.isArray(p) ? p : p && typeof p === 'object' ? [p] : []
    for (const x of list as { id?: string; title?: string; name?: string }[]) if (x?.id && (x.title || x.name)) out.set(x.id, (x.title || x.name)!)
  }
  return out
}

/** The lines a card shows for a value: at most five items, and how many more. */
export function previewLines(v: StepValue, title: (id: string) => string, project: (id: string) => string): { items: string[]; more: number; single?: string } {
  switch (v.type) {
    case 'lines': return { items: (v.lines ?? []).slice(0, PREVIEW_ITEMS), more: Math.max(0, (v.lines ?? []).length - PREVIEW_ITEMS) }
    case 'tasks': return { items: (v.ids ?? []).slice(0, PREVIEW_ITEMS).map(title), more: Math.max(0, (v.ids ?? []).length - PREVIEW_ITEMS) }
    case 'text': {
      const lines = (v.text ?? '').split('\n')
      return { items: lines.slice(0, PREVIEW_ITEMS), more: Math.max(0, lines.length - PREVIEW_ITEMS) }
    }
    case 'number': return { items: [], more: 0, single: renderNumber(v.number ?? 0) }
    case 'date': return { items: [], more: 0, single: v.date ?? '' }
    case 'task': return { items: [], more: 0, single: v.id ? title(v.id) : t('no task') }
    case 'project': return { items: [], more: 0, single: v.id ? project(v.id) : t('no project') }
  }
  return { items: [], more: 0 }
}
