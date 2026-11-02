// The step kinds (internal/rules/routine_steps.go): data steps call the pure
// functions of stepData.ts, steps with a tool plan through tools.ts.
import { nameId } from '../../ids'
import { compile, parse as parseQuery, type FilterContext } from '../../filter'
import type { Label, Project, Section, Task, FieldDef, RoutineStep } from '../../types'
import { cutText, filterLines, inFindScope, joinLines, replaceText, sortLines, sortTasks, splitLines, take, valueLen } from '../stepData'
import { dateLiteral } from '../steps'
import { resolveDate } from '../stepData'
import { isNull, parseStepActions, planActions, type PlanContext } from './actions'
import { PER_CALL } from './tools'
import { aiStep } from './ai'
import { clearNote, dateStep, emailStep, notifyStep, projectFromTemplate, projectOf, quickAddLine, ruleFiredNotice, setFocus, trackedTime, webhookStep } from './more'
import { Ended, fail, none, num, str, tasksVal, type ExecResult, type Inputs, type RunState } from './state'
import type { Change, Row } from './types'

export const MAX_LIST_ITEMS = 500

export const truncatedIf = (cut: boolean) => (cut ? 'truncated' : '')

export function textOut(text: string): ExecResult {
  const c = cutText(text)
  return [{ type: 'text', text: c.text }, truncatedIf(c.truncated)]
}

/** ids.NameID over parts joined by NUL. */
export const ids2 = (space: string, ...parts: string[]) => nameId(space, parts.join('\x00'))

export async function exec(st: RunState, s: RoutineStep, inputs: Inputs, at: number): Promise<ExecResult> {
  switch (s.kind) {
    case 'find_tasks': return findTasks(st, s)
    case 'create_tasks': return createTasks(st, s, inputs, at)
    case 'change_tasks': return changeTasks(st, s, inputs)
    case 'add_comment': return addComment(st, s, inputs, at)
    case 'project_of': return projectOf(st, s, inputs)
    case 'date': return dateStep(st, s, inputs)
    case 'get_task': {
      const v = st.entityIn(s, inputs, 'task')
      if (!st.liveTask(v?.id ?? '')) throw fail('not_found', `task ${v?.id ?? ''} not found`)
      return [v!, '']
    }
    case 'find_project': return findProject(st, s, inputs)
    case 'create_project': case 'update_project': case 'create_sections': case 'create_labels': case 'favourite':
      return projectStep(st, s, inputs, at)
    case 'note_text': return noteText(st, s, inputs)
    case 'append_to_note': return appendNote(st, s, inputs, at)
    case 'clear_note': return clearNote(st, s, inputs)
    case 'set_focus': return setFocus(st, s, inputs)
    case 'project_from_template': return projectFromTemplate(st, s, inputs, at)
    case 'split_lines': {
      const r = splitLines(st.textIn(s, inputs, 'text') ?? '', st.litStr(s, 'only') === 'open_checkboxes')
      return [{ type: 'lines', lines: r.lines }, truncatedIf(r.truncated)]
    }
    case 'join': {
      const lines = st.litStrings(s, 'lines') ?? inputs.get('lines')?.lines ?? []
      return textOut(joinLines(lines, st.litStr(s, 'separator') ?? ''))
    }
    case 'format': return textOut(st.format(st.litStr(s, 'template') ?? ''))
    case 'replace':
      return textOut(replaceText(st.textIn(s, inputs, 'text') ?? '', st.litStr(s, 'find') ?? '', st.litStr(s, 'with') ?? '', st.litBool(s, 'case') ?? false))
    case 'filter': case 'sort': case 'take': case 'count': return listStep(st, s, inputs)
    case 'stop': throw new Ended()
    case 'start_timer': case 'stop_timer': return timerStep(st, s, inputs, at)
    case 'tracked_time': return trackedTime(st, s, inputs)
    case 'notify': return notifyStep(st, s, inputs)
    case 'webhook': return webhookStep(st, s, inputs)
    case 'ask_ai': case 'summarise': return aiStep(st, s, inputs, at)
    case 'email_me': return emailStep(st, s, inputs)
  }
  throw fail('invalid_argument', `${s.kind} is not available on this device yet`)
}

/** The live tasks in list order (position, then id), optionally open only. */
function tasksInOrder(st: RunState, openOnly: boolean): Row[] {
  const out = [...st.tasks.values()].filter((t) => isNull(t.deleted_at) && (!openOnly || isNull(t.completed_at)))
  return out.sort((a, b) => {
    const pa = num(a, 'position'), pb = num(b, 'position')
    if (pa !== pb) return pa < pb ? -1 : 1
    return str(a, 'id') < str(b, 'id') ? -1 : str(a, 'id') > str(b, 'id') ? 1 : 0
  })
}

function scopeOf(st: RunState): Map<string, boolean> {
  const m = new Map<string, boolean>()
  for (const [id, p] of st.projects) if (isNull(p.deleted_at)) m.set(id, p.archived === true)
  return m
}

function findTasks(st: RunState, s: RoutineStep): ExecResult {
  let limit = MAX_LIST_ITEMS
  const n = st.litNum(s, 'limit')
  if (n !== undefined && n >= 1) limit = Math.trunc(n)
  const cond = s.in?.condition
  const match: (t: Row) => boolean = cond ? (t) => st.matchCond('literal' in cond ? cond.literal : null, t) : queryMatcher(st, s)
  // A query or a view follows the filter rule; a condition finds open tasks (routines-dynamic-data D5).
  const rows = tasksInOrder(st, !!cond)
  const archived = st.litBool(s, 'archived') ?? false
  const scope = scopeOf(st)
  const out: string[] = []
  let status = ''
  for (const t of rows) {
    if (!inFindScope({ deleted_at: null, project_id: str(t, 'project_id') || null }, scope, archived) || !match(t)) continue
    if (out.length === limit) { status = 'truncated'; break }
    out.push(str(t, 'id'))
  }
  return [tasksVal(out), status]
}

/** A filter query or a saved view's query, evaluated with the device's filter. */
function queryMatcher(st: RunState, s: RoutineStep): (t: Row) => boolean {
  let q = st.litStr(s, 'query') ?? ''
  const view = st.litStr(s, 'view')
  if (view !== undefined) {
    const v = st.w.views.find((x) => str(x, 'id') === view)
    if (!v || !isNull(v.deleted_at)) throw fail('not_found', `saved view ${view} not found`)
    q = str(v, 'query')
  }
  const ctx: FilterContext = {
    today: st.w.today, weekStart: st.w.weekStart, tasks: [...st.tasks.values()] as unknown as Task[],
    projects: [...st.projects.values()] as unknown as Project[], labels: st.labels as unknown as Label[],
    sections: [...st.sections.values()] as unknown as Section[], fields: (st.w.fields ?? []).filter((f) => isNull(f.deleted_at)) as unknown as FieldDef[],
    tracked: st.tracked(),
  }
  let test: (t: Task) => boolean
  try {
    const ast = parseQuery(q)
    if (!ast) return () => false
    test = compile(ast, ctx).test
  } catch (e) {
    throw fail('invalid_argument', (e as Error).message)
  }
  return (t) => test(t as unknown as Task)
}

function createdIds(changes: Change[], entity: string): string[] {
  return changes.filter((c) => c.entity === entity && c.create).map((c) => c.entityId)
}

function createTasks(st: RunState, s: RoutineStep, inputs: Inputs, at: number): ExecResult {
  const base: Record<string, unknown> = {}
  const project = st.entityIn(s, inputs, 'project')
  if (project?.id) base.project_id = project.id
  const parent = inputs.get('parent')
  if (parent) {
    if (!st.liveTask(parent.id ?? '')) throw fail('not_found', `task ${parent.id} not found`)
    base.parent_id = parent.id
  }
  const sec = st.litStr(s, 'section')
  if (sec !== undefined) base.section_id = sec
  const due = inputs.get('due')
  if (due) base.due = { date: due.date }
  else if (s.in?.due) {
    const d = dateLiteral('literal' in s.in.due ? s.in.due.literal : undefined)
    if (d) base.due = { date: resolveDate(d, st.w.today) }
  }
  const prio = inputs.get('priority')
  if (prio) base.priority = Math.trunc(prio.number ?? 0)
  else {
    const p = st.litNum(s, 'priority')
    if (p !== undefined && p >= 1) base.priority = Math.trunc(p)
  }
  const labels = st.litStrings(s, 'labels')
  if (labels) base.labels = labels
  const energy = st.litStr(s, 'energy')
  if (energy !== undefined) base.energy = energy
  let lines: string[] = []
  let parse = true
  const textV = inputs.get('text')
  if (textV?.type === 'lines') lines = textV.lines ?? []
  else {
    const text = st.textIn(s, inputs, 'text')
    if (text !== null) lines = splitLines(text).lines
    else {
      const title = st.textIn(s, inputs, 'title')
      if (title !== null) { lines = [title]; parse = false }
    }
  }
  const items: Record<string, unknown>[] = []
  for (const line of lines) {
    const item: Record<string, unknown> = { ...base }
    if (parse) quickAddLine(st, line, item)
    else item.title = line
    if (!String(item.title ?? '').trim()) continue
    items.push(item)
  }
  if (!items.length) return [tasksVal([]), '']
  if (items.length > MAX_LIST_ITEMS) throw fail('write_limit', `a step may create at most ${MAX_LIST_ITEMS} tasks`)
  const created: string[] = []
  for (let i = 0; i < items.length; i += PER_CALL) {
    const changes = st.tool('create_tasks', { items: items.slice(i, i + PER_CALL), client_request_id: `${st.clientId(at)}:${i}` })
    created.push(...createdIds(changes, 'task'))
  }
  return [tasksVal(created), '']
}

function changeTasks(st: RunState, s: RoutineStep, inputs: Inputs): ExecResult {
  const set = parseStepActions(st.lit(s, 'set'))
  const list = st.entityIn(s, inputs, 'tasks')
  const ids = list?.type === 'task' ? [list.id ?? ''] : list?.ids ?? []
  const shared = (id: string) => st.w.memberships.has(id)
  const pc: PlanContext = {
    today: st.w.today, nowMs: st.w.now, userId: st.w.userId, weekStart: st.w.weekStart,
    labelLive: (id) => st.w.labels.some((l) => str(l, 'id') === id && isNull(l.deleted_at)),
    sectionProject: (id) => str(st.w.sections.find((x) => str(x, 'id') === id), 'project_id'),
    projectShared: shared,
    projectLive: (id) => !!st.liveProject(id),
  }
  const a = set.actions
  if (a.section && !st.liveProject(a.section.project_id)) throw fail('not_found', `project ${a.section.project_id} not found`)
  if (a.comment !== undefined && st.w.encrypted) throw fail('encrypted', 'a comment cannot be written for an encrypted account')
  const changed: string[] = []
  for (const id of ids) {
    const t = st.liveTask(id)
    if (!t) throw fail('not_found', `task ${id} not found`)
    let patch: Record<string, unknown> = {}
    if (set.hasActions) {
      const p = planActions(a, t, pc)
      if (p.skipped.includes('shared project')) throw fail('shared_project', 'a routine cannot move tasks into or out of a shared project')
      patch = p.patch
      if (p.completing) st.completing.add(id)
    }
    if (set.energy !== undefined) {
      const e = set.energy === 'clear' ? '' : set.energy
      if (str(t, 'energy') !== e) patch.energy = e
    }
    if (set.trash) patch.deleted_at = st.w.now
    if (a.comment !== undefined) {
      const cid = ids2('routine-comment', st.r.id, st.key, id, String(st.seq))
      st.lay({ entity: 'comment', entityId: cid, create: true, patch: {
        task_id: id, body: a.comment, author_id: st.w.userId, mentions: [], created_at: st.w.now, deleted_at: null, parent_id: null, edited_at: null,
      } })
    }
    if (a.notify) st.sides.push(ruleFiredNotice(st, id))
    if (!Object.keys(patch).length) continue
    st.lay({ entity: 'task', entityId: id, patch })
    changed.push(id)
  }
  return [tasksVal(changed), '']
}

function addComment(st: RunState, s: RoutineStep, inputs: Inputs, at: number): ExecResult {
  const task = st.entityIn(s, inputs, 'task')
  const text = st.textIn(s, inputs, 'text') ?? ''
  if (!text.trim()) return [none(), 'skipped']
  const id = ids2('routine-comment', st.r.id, st.runId, String(at), String(st.seq), task?.id ?? '')
  st.tool('add_comment', { task_id: task?.id ?? '', body: text, id })
  return [none(), '']
}

function findProject(st: RunState, s: RoutineStep, inputs: Inputs): ExecResult {
  const name = (st.textIn(s, inputs, 'name') ?? '').trim()
  let best = ''
  for (const [id, p] of st.projects) {
    if (!isNull(p.deleted_at) || str(p, 'name').trim().toLowerCase() !== name.toLowerCase()) continue
    if (!best || id < best) best = id
  }
  if (!best) throw fail('not_found', `no project named "${name}"`)
  return [{ type: 'project', id: best }, '']
}

function projectStep(st: RunState, s: RoutineStep, inputs: Inputs, at: number): ExecResult {
  const project = st.entityIn(s, inputs, 'project')
  const pid = project?.id ?? ''
  const names = () => st.litStrings(s, 'names') ?? inputs.get('names')?.lines ?? []
  switch (s.kind) {
    case 'create_project': {
      const args: Record<string, unknown> = { name: st.textIn(s, inputs, 'name') ?? '', client_request_id: st.clientId(at) }
      const parent = st.entityIn(s, inputs, 'parent')
      if (parent) args.parent_id = parent.id
      for (const f of ['color', 'icon']) { const v = st.litStr(s, f); if (v !== undefined) args[f] = v }
      const created = createdIds(st.tool('create_project', args), 'project')
      if (!created.length) throw fail('invalid_argument', 'no project was created')
      return [{ type: 'project', id: created[0] }, '']
    }
    case 'update_project': {
      const args: Record<string, unknown> = { id: pid }
      const name = st.textIn(s, inputs, 'name')
      if (name !== null) args.name = name
      for (const f of ['color', 'icon']) { const v = st.litStr(s, f); if (v !== undefined) args[f] = v }
      if (Object.keys(args).length > 1) st.tool('update_project', args)
      const archived = st.litBool(s, 'archived')
      if (archived !== undefined) st.tool('archive_projects', { id: pid, archived })
      return [project ?? none(), '']
    }
    case 'create_sections': {
      const items = names().filter((n) => n.trim()).map((name) => ({ name }))
      if (!items.length) return [none(), 'skipped']
      st.tool('create_sections', { project_id: pid, items, client_request_id: st.clientId(at) })
      return [none(), '']
    }
    case 'create_labels': {
      names().forEach((n, i) => {
        if (!n.trim() || st.labelExists(n)) return
        st.tool('create_label', { name: n, client_request_id: `${st.clientId(at)}:${i}` })
      })
      return [none(), '']
    }
    case 'favourite':
      st.tool('set_favourite', { kind: 'project', id: pid, favourite: st.litBool(s, 'on') ?? false })
      return [none(), '']
  }
  return [none(), '']
}

function noteText(st: RunState, s: RoutineStep, inputs: Inputs): ExecResult {
  const of = st.entityIn(s, inputs, 'of')
  const row = of?.type === 'project' ? st.liveProject(of.id ?? '') : st.liveTask(of?.id ?? '')
  if (!row) throw fail('not_found', `${of?.type ?? 'task'} ${of?.id ?? ''} not found`)
  return textOut(str(row, 'description'))
}

function appendNote(st: RunState, s: RoutineStep, inputs: Inputs, at: number): ExecResult {
  const of = st.entityIn(s, inputs, 'of')
  const text = st.textIn(s, inputs, 'text') ?? ''
  if (!text.trim()) return [none(), 'skipped']
  if (of?.type === 'project') {
    st.tool('update_project', { id: of.id, append_description: text })
    return [none(), '']
  }
  const aid = ('r' + ids2('routine-append', st.runId, String(at), String(st.seq)).slice(0, 20)).replaceAll('-', '')
  st.tool('append_to_note', { task_id: of?.id ?? '', text, append_id: aid })
  return [none(), '']
}

function listStep(st: RunState, s: RoutineStep, inputs: Inputs): ExecResult {
  const list = inputs.get('list') ?? none()
  switch (s.kind) {
    case 'count': return [{ type: 'number', number: valueLen(list) }, '']
    case 'take': {
      const n = st.litNum(s, 'n') ?? 1
      const from = st.litStr(s, 'from') ?? ''
      if (from === 'all') return [list, '']
      if (list.type === 'lines') return [{ type: 'lines', lines: take(list.lines ?? [], Math.trunc(n), from === 'end') }, '']
      return [tasksVal(take(list.ids ?? [], Math.trunc(n), from === 'end')), '']
    }
    case 'filter': {
      const where = (st.lit(s, 'where') ?? {}) as Record<string, unknown>
      const keys = Object.keys(where)
      const single = keys.length === 1 && (keys[0] === 'contains' || keys[0] === 'not_contains')
      if (list.type === 'lines') {
        if (!single) throw fail('type_mismatch', 'filter: a condition filters tasks; use contains for lines')
        return [{ type: 'lines', lines: filterLines(list.lines ?? [], String(where[keys[0]]), keys[0] === 'not_contains') }, '']
      }
      if (single) throw fail('type_mismatch', 'filter: contains filters lines; use a condition for tasks')
      const out = (list.ids ?? []).filter((id) => { const t = st.tasks.get(id); return !!t && st.matchCond(where, t) })
      return [tasksVal(out), '']
    }
    case 'sort': {
      const by = st.litStr(s, 'by') ?? ''
      const desc = st.litStr(s, 'direction') === 'desc'
      if (list.type === 'lines') return [{ type: 'lines', lines: sortLines(list.lines ?? [], desc) }, '']
      const rows = (list.ids ?? []).map((id) => {
        const t = st.tasks.get(id)
        const due = t?.due as { date?: string } | null | undefined
        return { id, title: str(t, 'title'), due: due?.date ?? '', deadline: str(t, 'deadline'), priority: Math.trunc(num(t, 'priority')), created_at: Math.trunc(num(t, 'created_at')) }
      })
      return [tasksVal(sortTasks(rows, by, desc).map((r) => r.id)), '']
    }
  }
  return [none(), '']
}

function timerStep(st: RunState, s: RoutineStep, inputs: Inputs, at: number): ExecResult {
  if (s.kind === 'stop_timer') {
    try {
      st.tool('stop_timer', {})
    } catch (e) {
      if ((e as { code?: string }).code) return [none(), 'skipped']
      throw e
    }
    return [none(), '']
  }
  const task = st.entityIn(s, inputs, 'task')
  st.tool('start_timer', { task_id: task?.id ?? '', stop_running: true, client_request_id: st.clientId(at) })
  return [none(), '']
}

