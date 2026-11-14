// The note steps on this device (OpenSpec change notes-in-routines): the port
// of internal/rules/notes.go. Find notes, Get a specific note, Create note,
// Change notes and Turn into task, planned through tools.ts like the server
// plans them through the agent tool registry.
import type { RoutineStep, RuleCondition } from '../../types'
import { matchNote, parseQuery } from '../../noteSearch'
import { addDays, matchesCondition } from '../match'
import { sortTasks, type StepValue } from '../stepData'
import { ids2 } from './kinds'
import { roleIn } from './tools'
import { fail, isDeleted, none, num, str, taskVal, workspaceArg, type ExecResult, type Inputs, type RunState } from './state'
import type { Row } from './types'
import { fillTemplate, placeholderHour12, placeholderOrder } from '../../noteTemplateFill'
import { dateLiteral } from '../steps'
import { resolveDate } from '../stepData'
import { DAILY_TITLE, dailyNoteId } from '../../dailyNoteId'

const MAX_LIST_ITEMS = 500

const notesVal = (ids: string[]): StepValue => ({ type: 'notes', ids })
const listOf = (r: Row | undefined, f: string): string[] => (Array.isArray(r?.[f]) ? (r![f] as string[]) : [])

/** A note matches a condition's project and labels; unchanged reads its newest change (D3). */
export function matchNoteCond(st: RunState, c: RuleCondition | null | undefined, n: Row): boolean {
  const ctx = { ...st.matchContext(), open: () => true, changed: (id: string) => st.w.noteChanged?.[id] ?? '' }
  return matchesCondition(c, {
    id: str(n, 'id'), project_id: str(n, 'project_id') || null, section_id: null, labels: listOf(n, 'labels'), priority: 4, dueDate: null, deadline: null,
    start: null, evening: false, blocked_by: [], assignee_id: null, origin: null, habit: false, estimate_minutes: null,
  }, ctx)
}

/** Refuses a note of a project where the run-as person only views (D7). */
export function writableNote(st: RunState, n: Row): void {
  const pid = str(n, 'project_id')
  if (pid && roleIn(st.snapshot(), pid) === 'viewer') {
    throw fail('forbidden', `the note ${str(n, 'id')} is in ${str(st.projects.get(pid), 'name')}, where you can only view`)
  }
}

export function noteStep(st: RunState, s: RoutineStep, inputs: Inputs, at: number): ExecResult {
  switch (s.kind) {
    case 'find_notes': return findNotes(st, s, inputs)
    case 'get_note': {
      const v = st.entityIn(s, inputs, 'note')
      if (!st.liveNote(v?.id ?? '')) throw fail('not_found', `note ${v?.id ?? ''} not found`)
      return [{ type: 'note', id: v!.id }, '']
    }
    case 'create_note': return createNote(st, s, inputs, at)
    case 'note_from_template': return noteFromTemplate(st, s, inputs, at)
    case 'daily_note': return dailyNote(st, s, inputs)
    case 'change_notes': return changeNotes(st, s, inputs, at)
    case 'note_to_task': return noteToTask(st, inputs)
  }
  return [none(), '']
}

function findNotes(st: RunState, s: RoutineStep, inputs: Inputs): ExecResult {
  let limit = MAX_LIST_ITEMS
  const n = st.litNum(s, 'limit')
  if (n !== undefined && n >= 1 && Math.trunc(n) < limit) limit = Math.trunc(n)
  const cond: RuleCondition = {}
  const project = st.entityIn(s, inputs, 'project')
  if (project?.id) cond.project = { in: [project.id], descendants: true }
  const labels = st.lit(s, 'labels') as RuleCondition['labels'] | undefined
  if (labels) cond.labels = labels
  const unchanged = st.litNum(s, 'unchanged_days')
  if (unchanged !== undefined) cond.unchanged = { days: Math.trunc(unchanged) }
  const within = st.litNum(s, 'within_days')
  const words = st.litStr(s, 'words') ?? ''
  const terms = parseQuery(words)
  const hits: { id: string; ms: number }[] = []
  for (const [id, note] of st.notes) {
    if (isDeleted(note) || !matchNoteCond(st, cond, note)) continue
    const d = st.w.noteChanged?.[id] ?? ''
    if (within !== undefined && (!d || d <= addDays(st.w.today, -Math.trunc(within)))) continue
    if (words.trim() && !matchNote({ title: str(note, 'title'), text: str(note, 'description') }, terms).matched) continue
    hits.push({ id, ms: st.w.noteMs?.[id] ?? 0 })
  }
  hits.sort((a, b) => (a.ms !== b.ms ? b.ms - a.ms : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  if (hits.length > limit) return [notesVal(hits.slice(0, limit).map((h) => h.id)), 'truncated']
  return [notesVal(hits.map((h) => h.id)), '']
}

function createNote(st: RunState, s: RoutineStep, inputs: Inputs, at: number): ExecResult {
  return writeNote(st, st.textIn(s, inputs, 'title') ?? '', st.textIn(s, inputs, 'text') ?? '', st.entityIn(s, inputs, 'project')?.id ?? '', st.litStrings(s, 'labels'), at)
}

/** A note from a user template or a built-in one, placeholders filled with the step's date (note-templates D5). */
function noteFromTemplate(st: RunState, s: RoutineStep, inputs: Inputs, at: number): ExecResult {
  const ref = st.litStr(s, 'template') ?? ''
  const lang = typeof st.prefs.language === 'string' && st.prefs.language !== 'system' && st.prefs.language ? st.prefs.language : 'en'
  let title = ''
  let body = ''
  let pid = ''
  let labels: string[] | undefined
  if (ref.startsWith('builtin:')) {
    const b = st.w.noteTemplates?.find((x) => x.slug === ref.slice(8))
    if (!b) throw fail('template_missing', `The template ${ref.slice(8)} does not exist`)
    title = b.title[lang] ?? b.title.en
    body = b.body[lang] ?? b.body.en
  } else {
    const n = st.liveNote(ref)
    if (!n || n.template !== true) throw fail('template_missing', 'The template is in the Trash')
    title = str(n, 'title'); body = str(n, 'description'); pid = str(n, 'project_id'); labels = listOf(n, 'labels')
  }
  const own = st.textIn(s, inputs, 'title')
  if (own && own.trim()) title = own
  const project = st.entityIn(s, inputs, 'project')?.id
  if (project) pid = project
  labels = st.litStrings(s, 'labels') ?? labels ?? []
  let day = st.w.today
  const dv = inputs.get('date')
  if (dv?.date) day = dv.date
  else {
    const d = dateLiteral(st.lit(s, 'date'))
    if (d) day = resolveDate(d, st.w.today)
  }
  const clock = new Date(st.w.now + st.w.offset * 60_000).toISOString().slice(11, 16)
  const filled = fillTemplate(title, body, { date: day, time: clock, order: placeholderOrder(str(st.prefs, 'date_format'), lang), hour12: placeholderHour12(str(st.prefs, 'time_format'), lang), lang })
  return writeNote(st, filled.title, filled.text, pid, labels, at)
}

function writeNote(st: RunState, title: string, text: string, projectId: string, labels: string[] | undefined, at: number): ExecResult {
  const id = ids2('routine-note', st.r.id, st.runId, String(at), String(st.seq))
  const args: Record<string, unknown> = { title, description: text, id }
  let pid = projectId
  if (labels && !st.w.project) args.label_ids = labels
  if (st.w.project) pid = st.w.project
  if (pid) args.project_id = pid
  const changes = st.tool('create_note', args)
  const created = changes.find((c) => c.entity === 'note' && c.create)?.entityId
  if (!created) throw fail('invalid_argument', 'create_note planned no note')
  const ws = workspaceArg(st)
  if (!pid && ws.workspace_id) st.lay({ entity: 'note', entityId: created, patch: { workspace_id: ws.workspace_id } })
  return [{ type: 'note', id: created }, '']
}

function scopeOf(st: RunState, pid: string): string {
  return pid && st.w.memberships.has(pid) ? pid : ''
}

function changeNotes(st: RunState, s: RoutineStep, inputs: Inputs, at: number): ExecResult {
  const list = inputs.get('notes') ?? notesVal([])
  const ids = list.type === 'note' ? [list.id ?? ''] : list.ids ?? []
  const add = st.litStrings(s, 'add_labels') ?? []
  const remove = st.litStrings(s, 'remove_labels') ?? []
  const project = st.entityIn(s, inputs, 'project')
  const move = !!project || st.litBool(s, 'no_project') === true
  const target = project?.id ?? ''
  const pin = st.litBool(s, 'pin')
  const trash = st.litBool(s, 'trash') === true
  const out: string[] = []
  let refused = 0
  ids.forEach((id, i) => {
    st.seq = i
    const n = st.liveNote(id)
    if (!n) { refused++; return }
    writableNote(st, n)
    if (pin !== undefined) st.tool('set_favourite', { kind: 'note', id, favourite: pin })
    if (trash) {
      st.tool('trash_note', { ids: [id] })
      out.push(id)
      return
    }
    const args: Record<string, unknown> = { id }
    if (add.length || remove.length) {
      const current = listOf(n, 'labels')
      const labels = current.filter((l) => !remove.includes(l))
      for (const l of add) if (!labels.includes(l)) labels.push(l)
      if (labels.join('\x00') !== current.join('\x00')) args.label_ids = labels
    }
    const from = str(n, 'project_id')
    if (move && target !== from) {
      if (scopeOf(st, from) !== scopeOf(st, target)) {
        // A move across sharing scopes copies the note and trashes the original, as the device does.
        const copyId = ids2('routine-note-copy', st.r.id, st.runId, String(at), id)
        const copy: Record<string, unknown> = { title: str(n, 'title'), description: str(n, 'description'), id: copyId }
        if (target) copy.project_id = target
        const labels = (args.label_ids as string[] | undefined) ?? listOf(n, 'labels')
        if (!st.w.memberships.has(target) && labels.length) copy.label_ids = labels
        st.tool('create_note', copy)
        st.tool('trash_note', { ids: [id] })
        out.push(copyId)
        return
      }
      args.project_id = target || null
    }
    if (Object.keys(args).length > 1) st.tool('update_note', args)
    out.push(id)
  })
  return [notesVal(out), refused ? 'skipped' : '']
}

function noteToTask(st: RunState, inputs: Inputs): ExecResult {
  const id = inputs.get('note')?.id ?? ''
  const n = st.liveNote(id)
  if (!n) throw fail('not_found', `note ${id} not found`)
  writableNote(st, n)
  const changes = st.tool('note_to_task', { id })
  const created = changes.find((c) => c.entity === 'task' && c.create)?.entityId
  if (!created) throw fail('invalid_argument', 'note_to_task planned no task')
  return [taskVal(created), '']
}

/** Notes ordered by title, creation or last change. */
export function sortNotes(st: RunState, list: StepValue, by: string, desc: boolean): StepValue {
  const rows = (list.ids ?? []).map((id) => {
    const n = st.notes.get(id)
    return { id, title: str(n, 'title'), created_at: num(n, 'created_at'), changed_at: st.w.noteMs?.[id] ?? 0 }
  })
  return notesVal(sortTasks(rows, by, desc).map((r) => r.id))
}

/** The notes matching a condition's project and labels. */
export function filterNotes(st: RunState, list: StepValue, where: Record<string, unknown>): StepValue {
  return notesVal((list.ids ?? []).filter((id) => { const n = st.liveNote(id); return !!n && matchNoteCond(st, where as RuleCondition, n) }))
}

/**
 * The step's date's daily note of the run-as person (daily-notes D6), as
 * internal/rules dailyNote: brought back from the Trash, or created from the
 * Daily notes settings with the name-based id, the template's text and labels.
 */
function dailyNote(st: RunState, s: RoutineStep, inputs: Inputs): ExecResult {
  if (st.prefs.daily_notes !== true) throw fail('daily_notes_off', 'Daily notes are turned off')
  let day = st.w.today
  const dv = inputs.get('date')
  if (dv?.date) day = dv.date
  else {
    const d = dateLiteral(st.lit(s, 'date'))
    if (d) day = resolveDate(d, st.w.today)
  }
  const id = dailyNoteId(st.w.userId, day)
  const existing = st.notes.get(id)
  if (existing) {
    if (isDeleted(existing)) st.lay({ entity: 'note', entityId: id, patch: { deleted_at: null } })
    return [{ type: 'note', id }, '']
  }
  let pid = str(st.prefs, 'daily_notes_project')
  if (pid) {
    if (st.w.elsewhere?.has(pid)) throw fail('other_workspace', 'The project for daily notes is in another workspace')
    if (!st.liveProject(pid)) pid = ''
  }
  const lang = typeof st.prefs.language === 'string' && st.prefs.language !== 'system' && st.prefs.language ? st.prefs.language : 'en'
  let tplTitle = ''
  let body = ''
  let labels: string[] = []
  const ref = str(st.prefs, 'daily_notes_template')
  if (ref !== 'none') {
    const n = ref ? st.liveNote(ref) : undefined
    if (n && n.template === true) {
      tplTitle = str(n, 'title'); body = str(n, 'description'); labels = listOf(n, 'labels') ?? []
    } else {
      const b = st.w.noteTemplates?.find((x) => x.slug === 'daily')
      if (b) { tplTitle = b.title[lang] ?? b.title.en; body = b.body[lang] ?? b.body.en }
    }
  }
  const clock = new Date(st.w.now + st.w.offset * 60_000).toISOString().slice(11, 16)
  const ctx = { date: day, time: clock, order: placeholderOrder(str(st.prefs, 'date_format'), lang), hour12: placeholderHour12(str(st.prefs, 'time_format'), lang), lang }
  const text = fillTemplate(tplTitle, body, ctx).text
  const title = fillTemplate(DAILY_TITLE, '', ctx).title
  const args: Record<string, unknown> = { title, description: text, id, label_ids: labels }
  if (pid) args.project_id = pid
  const changes = st.tool('create_note', args)
  if (!changes.some((c) => c.entity === 'note' && c.create)) throw fail('invalid_argument', 'create_note planned no note')
  const patch: Record<string, unknown> = { day }
  const ws = workspaceArg(st)
  if (!pid && ws.workspace_id) patch.workspace_id = ws.workspace_id
  st.lay({ entity: 'note', entityId: id, patch })
  return [{ type: 'note', id }, '']
}

