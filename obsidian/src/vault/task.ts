// Merging one task line (internal/vault/task.go): projections onto compared
// strings, the merge rules of design D7, op values and the recurring
// completion the app does.
import { occurrenceId } from '../../../web/src/lib/ids'
import { followingOccurrence, parseRule, type Rule } from '../../../web/src/lib/recurrence'
import { goTrim, noteText, trimNewlines, type Node } from './doc'
import type { Body, Engine } from './engine'
import { byteOrder, goQuote, short, sortedKeys } from './gojson'
import { lineFields, type Line } from './line'
import * as S from './store'
import { storedPart, validEnergy, type View } from './view'
import { localDate, midnight } from './zone'

/** The projections the merge compares (design D6). */
export const TASK_FIELDS = ['title', 'done', 'donedate', 'due', 'start', 'deadline', 'estimate', 'evening', 'span', 'daypart', 'energy', 'priority', 'recur', 'labels', 'blocked', 'note', 'parent', 'section', 'project']

/** Where a task line sits in a parsed file. */
export interface Place {
  path: string
  project: string
  parent: string
  section: string
  node: Node
}

/** What one merge reads (mergeRun in merge.go). */
export interface MergeRun {
  av: View
  bv: View
  baseLayout: Map<string, string>
  labels: Map<string, string>
  newLabels: Map<string, string>
  sections: Map<string, string>
  placed: Map<string, Place>
  groups: Map<string, string[]>
  groupKeys: string[]
  moved: Set<string>
}

export type Proj = Map<string, string>

const prio = (p: number) => String(p < 1 || p > 4 ? 4 : p)
const sortStrings = (a: string[]) => a.sort(byteOrder)

/** null for "" (nullable in merge.go). */
export const nullable = (s: string): string | null => (s === '' ? null : s)

function dueKey(d: S.Due | null): string {
  if (!d) return ''
  return `${d.date}|${d.time ?? ''}|${d.tz ?? ''}`
}

/** A task row of a view projected onto the compared fields. */
export function proj(v: View, id: string): Proj {
  const r = S.get(v.s, 'task', id)
  const p: Proj = new Map([
    ['title', v.text('task', id, 'title')], ['done', String(S.isSet(r, 'completed_at'))], ['donedate', ''],
    ['due', dueKey(S.dueOf(r))], ['start', S.str(r, 'start')], ['deadline', S.str(r, 'deadline')], ['estimate', ''],
    ['evening', String(S.bool(r, 'evening'))], ['span', String(S.bool(r, 'span'))],
    ['daypart', S.bool(r, 'evening') || !storedPart(S.str(r, 'day_part')) ? '' : S.str(r, 'day_part')],
    ['energy', validEnergy(S.str(r, 'energy')) ? S.str(r, 'energy') : ''], ['priority', prio(Math.trunc(S.num(r, 'priority')))], ['recur', S.str(r, 'recurrence')],
    ['note', trimNewlines(v.text('task', id, 'description'))],
    ['parent', S.str(r, 'parent_id')], ['section', S.str(r, 'section_id')], ['project', S.str(r, 'project_id')],
  ])
  if (S.isSet(r, 'completed_at')) p.set('donedate', v.localDate(S.num(r, 'completed_at')))
  const m = Math.trunc(S.num(r, 'estimate_minutes'))
  if (m > 0) p.set('estimate', String(m))
  p.set('labels', sortStrings(S.strs(r, 'labels').filter((l) => S.live(S.get(v.s, 'label', l)))).join(','))
  p.set('blocked', sortStrings([...S.strs(r, 'blocked_by')]).join(','))
  return p
}

export function sameProj(a: Proj, b: Proj): boolean {
  if (a.size !== b.size) return false
  for (const [k, v] of a) if (b.get(k) !== v) return false
  return true
}

/** Reads either 🔁 phrase back and canonicalises the rule. */
export function ruleFromFile(text: string): { rule: string } | { error: string } {
  let t = goTrim(text)
  if (t.endsWith(' when done')) t = t.slice(0, -' when done'.length) + ' after completion'
  const r = parseRule(t)
  return r.ok ? { rule: r.canonical } : { error: `invalid recurrence rule: ${r.error}` }
}

/** A task line projected onto the compared fields; values that do not parse are reported and left out. */
function fileProj(e: Engine, m: MergeRun, pl: Place, baseP: Proj | null): Proj {
  const l = pl.node.line
  const id = l.id
  const bad = (msg: string) => e.warn(`${pl.path}: ${goQuote(l.title)}: ${msg}`)
  const { fields, problems } = lineFields(l)
  const p: Proj = new Map(Object.entries(fields))
  for (const msg of problems) bad(msg)
  p.set('note', trimNewlines(noteText(pl.node)))
  p.set('parent', pl.parent)
  p.set('section', pl.section)
  p.set('project', pl.project)
  if (l.recur === '') p.set('recur', '')
  else {
    const r = ruleFromFile(l.recur)
    if ('rule' in r) p.set('recur', r.rule)
    else bad(`🔁 ${l.recur}: ${r.error}`)
  }
  p.set('labels', fileLabels(e, m, l.tags))
  const blocked = fileBlocked(e, m, pl, bad)
  if (blocked !== null) p.set('blocked', blocked)
  if (m.av.undecryptable.has(`task:${id}:title`)) p.delete('title')
  if (m.av.undecryptable.has(`task:${id}:description`)) p.delete('note')
  if (baseP) {
    const bp = baseP.get('parent') ?? ''
    if (pl.parent === '' && bp !== '' && (m.placed.get(bp)?.path ?? '') !== pl.path) p.set('parent', bp)
    const bs = baseP.get('section') ?? ''
    if (pl.parent !== '') p.delete('section')
    else if (bs !== '' && !S.live(S.get(m.av.s, 'section', bs)) && pl.section === '') p.set('section', bs)
  }
  return p
}

/** A line's tags as label ids: the base's names first, then the app's, else a label this sync creates (new:<slug>). */
function fileLabels(e: Engine, m: MergeRun, tags: string[]): string {
  const baseSlugs = m.bv.labelSlugs()
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of tags) {
    const sl = t.toLowerCase()
    let id = baseSlugs.get(sl)
    if (id !== undefined && !S.live(S.get(e.app, 'label', id))) id = undefined
    if (id === undefined) id = m.labels.get(sl)
    if (id === undefined) id = 'new:' + sl
    if (!seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  return sortStrings(out).join(',')
}

/** A line's ⛔ ids: known tasks in the task's own sharing scope; null when one is not. */
function fileBlocked(e: Engine, m: MergeRun, pl: Place, bad: (msg: string) => void): string | null {
  const l = pl.node.line
  const scope = e.scopeOf(pl.project)
  const out = [...l.blocked]
  for (const b of out) {
    let proj = ''
    let ok = false
    const bp = m.placed.get(b)
    if (bp) {
      proj = bp.project
      ok = true
    } else {
      const r = S.get(e.app, 'task', b)
      if (r !== undefined) {
        proj = S.str(r, 'project_id')
        ok = true
      }
    }
    if (!ok || b === l.id) {
      bad(`⛔ ${b} is not a task of the account`)
      return null
    }
    if (e.scopeOf(proj) !== scope) {
      bad(`⛔ ${short(b)} is a task of another sharing; blockers stay within one`)
      return null
    }
  }
  return sortStrings(out).join(',')
}

/** Merges one task line (D7). */
export function mergeTask(e: Engine, m: MergeRun, pl: Place): void {
  const id = pl.node.line.id
  e.st.extra ??= {}
  if (pl.node.line.trailing !== '') e.st.extra[id] = pl.node.line.trailing
  else delete e.st.extra[id]
  if (e.fresh.has('task:' + id)) {
    createTask(e, m, pl)
    return
  }
  const a = S.get(e.app, 'task', id)
  const b = S.get(e.base, 'task', id)
  const appP = proj(m.av, id)
  const baseP = b !== undefined ? proj(m.bv, id) : appP
  const fileP = fileProj(e, m, pl, baseP)
  if (!S.live(a)) {
    for (const [f, v] of fileP) {
      if (e.takeOver || (S.live(b) && v !== baseP.get(f))) {
        e.conflict(pl.path, pl.node.raw, 'trashed in the app')
        break
      }
    }
    return
  }
  readOnlyEdits(e, m, pl)
  const changed: string[] = []
  const both: string[] = []
  for (const f of TASK_FIELDS) {
    const fv = fileP.get(f)
    if (fv === undefined || fv === baseP.get(f) || fv === appP.get(f)) continue
    if (appP.get(f) !== baseP.get(f) || e.takeOver) {
      both.push(f)
      continue
    }
    changed.push(f)
  }
  if (both.length > 0) e.conflict(pl.path, pl.node.raw, both.join(', '))
  if (changed.length === 0) return
  const body = e.body('task', id)
  for (const f of changed) setField(e, m, body, f, pl, fileP)
  const title = goQuote(m.av.text('task', id, 'title'))
  if (recurring(e, m, id, body)) e.event('completed', pl.path, id, `completed ${title}; the next one is on the line`)
  else if (fileP.get('done') === 'true' && appP.get('done') === 'false') e.event('completed', pl.path, id, `completed ${title}`)
  else if (fileP.get('done') === 'false' && appP.get('done') === 'true') e.event('reopened', pl.path, id, `reopened ${title}`)
  else e.event('updated', pl.path, id, `updated ${title} (${changed.join(', ')})`)
  e.rep.updated++
}

/** Reports edits to the fields the file never pushes. */
function readOnlyEdits(e: Engine, m: MergeRun, pl: Place): void {
  const app = m.av.readOnly(pl.node.line.id)
  const ro = pl.node.line.readOnly
  const keys = new Set([...Object.keys(app), ...Object.keys(ro)])
  for (const k of sortedKeys(Object.fromEntries([...keys].map((x) => [x, true])))) {
    if ((app[k] ?? '') !== (ro[k] ?? '')) e.warn(`${pl.path}: ${goQuote(pl.node.line.title)}: [${k}:: ] is read-only in the vault; the app's value is written back`)
  }
}

/** 12:00 local on a date, else null. */
function noonOf(e: Engine, date: string): number | null {
  const t = midnight(date, e.o.zone)
  return t === null ? null : t + 12 * 3600 * 1000
}

/** The completion time of a ticked line: 12:00 local on its ✅ date, else now. */
function doneAt(e: Engine, l: Line): number {
  return noonOf(e, l.doneDate) ?? e.nowMS()
}

const atoi = (s: string): number | null => (/^[+-]?\d+$/.test(s) ? Number(s) : null)

/** The op value of one changed projection. */
function setField(e: Engine, m: MergeRun, b: Body, f: string, pl: Place, fileP: Proj): void {
  const l = pl.node.line
  const fv = fileP.get(f) ?? ''
  switch (f) {
    case 'title': b.set('title', l.title); break
    case 'done':
      if (l.done) {
        b.set('completed_at', doneAt(e, l))
        b.set('completed_by', nullable(e.o.userID))
      } else {
        b.set('completed_at', null)
        b.set('completed_by', null)
      }
      break
    case 'donedate':
      if (l.done) b.set('completed_at', doneAt(e, l))
      break
    case 'due': {
      if (l.due === '') {
        b.set('due', null)
        break
      }
      const d: S.Due = { date: l.due }
      if (l.time !== '') {
        d.time = l.time
        if (l.tz !== '') d.tz = l.tz
      }
      b.set('due', d)
      break
    }
    case 'start':
    case 'deadline': b.set(f, nullable(fv)); break
    case 'estimate': b.set('estimate_minutes', atoi(fv)); break
    case 'evening': b.set('evening', l.evening); break
    case 'span': b.set('span', fv === 'true'); break
    case 'daypart':
      b.set('day_part', nullable(fv))
      if (fv !== '') b.set('evening', false)
      break
    case 'energy': b.set('energy', fv); break
    case 'priority': b.set('priority', atoi(fv) ?? 0); break
    case 'recur': b.set('recurrence', nullable(fv)); break
    case 'labels': {
      const out: string[] = []
      for (let id of fv.split(',')) {
        if (id.startsWith('new:')) id = labelFor(e, m, id.slice(4))
        if (id !== '') out.push(id)
      }
      b.set('labels', out)
      break
    }
    case 'blocked': b.set('blocked_by', fv !== '' ? fv.split(',') : []); break
    case 'note': b.set('description', fv); break
    case 'parent':
      b.set('parent_id', nullable(fv))
      m.moved.add(l.id)
      break
    case 'section':
      b.set('section_id', nullable(fv))
      m.moved.add(l.id)
      break
    case 'project':
      b.set('project_id', nullable(fv))
      m.moved.add(l.id)
      break
  }
}

/** Creates the label of a tag no label matches. */
function labelFor(e: Engine, m: MergeRun, sl: string): string {
  const known = m.newLabels.get(sl)
  if (known !== undefined) return known
  const id = e.newID('label', sl)
  let pos = 0
  for (const l of S.ids(e.app, 'label')) {
    const p = S.num(S.get(e.app, 'label', l), 'position')
    if (p >= pos) pos = p + 1000
  }
  pos += 1000 * m.newLabels.size
  const b = e.body('label', id)
  b.set('name', sl)
  b.set('color', '#64748b')
  b.set('position', pos)
  b.set('created_at', e.nowMS())
  b.set('deleted_at', null)
  e.fresh.add('label:' + id)
  m.newLabels.set(sl, id)
  e.event('label', '', '', `created label ${goQuote(sl)}`)
  return id
}

/** Creates the task of a new line. */
function createTask(e: Engine, m: MergeRun, pl: Place): void {
  const id = pl.node.line.id
  const l = pl.node.line
  const fileP = fileProj(e, m, pl, null)
  const b = e.body('task', id)
  const created = noonOf(e, l.created) ?? e.nowMS()
  const defaults: [string, unknown][] = [
    ['title', ''], ['description', ''], ['project_id', null], ['parent_id', null], ['section_id', null],
    ['priority', 4], ['due', null], ['labels', []], ['created_at', created], ['completed_at', null], ['deleted_at', null],
    ['estimate_minutes', null], ['deadline', null], ['start', null], ['evening', false], ['blocked_by', []], ['recurrence', null],
  ]
  for (const [k, v] of defaults) b.set(k, v)
  for (const f of TASK_FIELDS) {
    const v = fileP.get(f)
    if (v !== undefined && f !== 'donedate' && !((f === 'daypart' || f === 'energy') && v === '') && !(f === 'span' && v === 'false')) setField(e, m, b, f, pl, fileP)
  }
  e.rep.created++
  e.event('created', pl.path, id, `created ${goQuote(l.title)} in ${pl.path}`)
}

/** A date moved by as many days as from `from` to `to` (recurrence.ShiftDate); invalid input returns date. */
function shiftDate(date: string, from: string, to: string): string {
  const day = (s: string) => {
    const t = midnight(s, 'UTC')
    return t === null ? null : Math.round(t / 86400000)
  }
  const [d, f, n] = [day(date), day(from), day(to)]
  if (d === null || f === null || n === null) return date
  return localDate((d + n - f) * 86400000, 'UTC')
}

/** recurrence.Rule.NextFree: the next occurrence that is not an exception date, null at the end. */
function nextFree(rule: Rule, due: string, today: string, taken: number, except: Set<string>): string | null {
  try {
    let next = followingOccurrence(rule, due === '' ? null : due, today, today, taken)
    for (let i = 0; next !== null && except.has(next); i++) {
      if (i === 3700) return null
      next = followingOccurrence(rule, next, today, rule.afterCompletion ? next : today, taken)
    }
    return next
  } catch {
    return null
  }
}

/** Completes a recurring series the way the app does (internal/sync.RecurringCompletion). */
function recurring(e: Engine, m: MergeRun, id: string, b: Body): boolean {
  if (!b.has('completed_at')) return false
  const at = b.get('completed_at')
  const a = S.get(e.app, 'task', id)
  if (at === null || at === undefined || S.isSet(a, 'completed_at')) return false
  let ruleText = S.str(a, 'recurrence')
  if (b.has('recurrence')) {
    const r = b.get('recurrence')
    ruleText = typeof r === 'string' ? r : ''
  }
  if (ruleText === '') return false
  const parsed = parseRule(ruleText)
  if (!parsed.ok) return false
  const merged = new Map<string, unknown>()
  for (const k of Object.keys(a ?? {})) merged.set(k, a![k].v)
  for (const [k, v] of b) merged.set(k, v)
  const cur = S.dueValue(merged.get('due') ?? null)
  const today = localDate(e.nowMS(), e.o.zone)
  const date = cur ? cur.date : today
  const dueDate = cur ? cur.date : ''
  const { taken, dates } = seriesBudget(e, id, date)
  const next = nextFree(parsed.rule, dueDate, today, taken, dates)
  if (next === null) return false
  const rid = occurrenceId(id, date)
  const rec = e.body('task', rid)
  e.fresh.add('task:' + rid)
  rec.set('due', cur ? (merged.get('due') ?? null) : { date })
  rec.set('created_at', at)
  rec.set('completed_at', at)
  rec.set('deleted_at', null)
  rec.set('recurrence', null)
  rec.set('series_id', id)
  rec.set('occurrence_date', date)
  rec.set('skipped', false)
  rec.set('title', b.has('title') ? b.get('title') : m.av.text('task', id, 'title'))
  rec.set('description', b.has('description') ? b.get('description') : m.av.text('task', id, 'description'))
  for (const f of ['project_id', 'parent_id', 'priority', 'labels', 'position', 'estimate_minutes']) if (merged.has(f)) rec.set(f, merged.get(f))
  for (const [f, v] of merged) if (f.startsWith('fields.')) rec.set(f, v)
  const str = (f: string) => {
    const v = merged.get(f)
    return typeof v === 'string' ? v : ''
  }
  if (str('section_id') !== '') rec.set('section_id', str('section_id'))
  const deadline = str('deadline')
  const start = str('start')
  if (deadline !== '') {
    rec.set('deadline', deadline)
    b.set('deadline', shiftDate(deadline, date, next))
  }
  if (start !== '') {
    rec.set('start', start)
    if (start !== 'someday') b.set('start', shiftDate(start, date, next))
  }
  if (merged.get('evening') === true) rec.set('evening', true)
  if (merged.get('span') === true) rec.set('span', true)
  if (storedPart(str('day_part'))) rec.set('day_part', str('day_part'))
  if (validEnergy(str('energy'))) rec.set('energy', str('energy'))
  if (b.has('completed_by')) {
    rec.set('completed_by', b.get('completed_by'))
    b.delete('completed_by')
  }
  b.delete('completed_at')
  const nd: S.Due = { date: next }
  if (cur) {
    if (cur.time !== undefined) nd.time = cur.time
    if (cur.tz !== undefined) nd.tz = cur.tz
  }
  b.set('due', nd)
  return true
}

/** The occurrence records of a series: done and open ones other than except count toward "for N times"; every record's date is an exception. */
function seriesBudget(e: Engine, id: string, except: string): { taken: number; dates: Set<string> } {
  let taken = 0
  const dates = new Set<string>()
  for (const t of S.ids(e.app, 'task')) {
    const r = S.get(e.app, 'task', t)
    if (S.str(r, 'series_id') !== id || S.isSet(r, 'deleted_at')) continue
    let date = S.str(r, 'occurrence_date')
    const d = S.dueOf(r)
    if (date === '' && d) date = d.date
    if (date === '' || t !== occurrenceId(id, date)) continue
    dates.add(date)
    if (date !== except && !(S.isSet(r, 'completed_at') && S.bool(r, 'skipped'))) taken++
  }
  return { taken, dates }
}
