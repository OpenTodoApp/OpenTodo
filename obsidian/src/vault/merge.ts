// Merging the changed files (internal/vault/merge.go, status.go): files to
// projects, front matter, new projects and sections, task placement, removed
// lines and positions (design D6, D7, D8).
import { fileFlow, fileStatus, goTrim, KEY_COLOR, KEY_FLOW, KEY_STATUS, noteText, noteToFile, parseDoc, trimIndent, walk, type Doc, type Item, type Node } from './doc'
import type { Engine } from './engine'
import { goQuote, own, short, sortedKeys, utf8 } from './gojson'
import * as S from './store'
import { LimitError } from './types'
import { mergeTask, nullable, proj, sameProj, type MergeRun, type Place } from './task'
import { defaultColor, INBOX_FILE, safeName, sortByPosition } from './view'

const COLOR = /^#[0-9a-fA-F]{6}$/
const MAX_NOTE_BYTES = 64 << 10

const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '.')
const baseOf = (p: string) => p.slice(p.lastIndexOf('/') + 1)
export const stem = (p: string) => baseOf(p).replace(/\.md$/, '')
const pjoin = (dir: string, name: string) => (dir === '.' || dir === '' ? name : `${dir}/${name}`)
const slashes = (p: string) => p.split('/').length - 1

/** Parses the changed files and turns their differences from the base into pending values. */
export async function merge(e: Engine): Promise<void> {
  const av = e.view(e.app)
  const bv = e.view(e.base)
  const m: MergeRun = {
    av, bv, baseLayout: bv.layout(), labels: av.labelSlugs(), newLabels: new Map(), sections: new Map(),
    placed: new Map(), groups: new Map(), groupKeys: [], moved: new Set(),
  }
  e.parsed = new Map()
  e.fileOf = new Map()
  e.skip = new Set()
  mapFiles(e, m)
  placeTasks(e, m)
  for (const id of sortedKeys(m.placed)) mergeTask(e, m, m.placed.get(id)!)
  removedLines(e, m)
  for (const k of m.groupKeys) positions(e, m, m.groups.get(k)!)
}

/** Matches each changed file to its project and applies renames, moves and front-matter edits. */
function mapFiles(e: Engine, m: MergeRun): void {
  const paths = sortedKeys(Object.fromEntries([...e.changed].map((p) => [p, true])))
  paths.sort((a, b) => slashes(a) - slashes(b))
  const claimed = new Set<string>()
  const fresh: string[] = []
  for (const p of paths) {
    const pre = parseDoc(e.disk.get(p)!, () => false)
    if (p === INBOX_FILE) e.fileOf.set(p, '')
    else if (pre.id !== '' && S.get(e.app, 'project', pre.id) !== undefined && !claimed.has(pre.id)) {
      claimed.add(pre.id)
      if (!m.av.projectLive(pre.id)) {
        e.skip.add(p)
        continue
      }
      e.fileOf.set(p, pre.id)
      projectEdits(e, m, p, pre)
    } else {
      if (pre.id !== '') e.warn(`${p}: the project id ${short(pre.id)} is not in the account; the file becomes a new project`)
      fresh.push(p)
    }
  }
  for (const p of fresh) newProject(e, p)
  for (const p of paths) {
    if (e.skip.has(p)) continue
    const pid = e.fileOf.get(p) ?? ''
    const doc = parseDoc(e.disk.get(p)!, isSection(m, pid))
    doc.id = pid
    e.parsed.set(p, doc)
  }
}

function isSection(m: MergeRun, pid: string): (n: string) => boolean {
  if (pid === '') return () => false
  const names = new Set(m.av.sectionsOf(pid).map((s) => m.av.text('section', s, 'name').toLowerCase()))
  return (n) => names.has(n.toLowerCase())
}

/** The project a folder belongs to: its folder note `<dir>/<name>.md`, else `<name>.md` beside it. */
function folderProject(e: Engine, dir: string): string {
  if (dir === '' || dir === '.') return ''
  const name = baseOf(dir)
  const parent = dirOf(dir)
  for (const c of [pjoin(dir, name + '.md'), pjoin(parent, name + '.md')]) {
    const pid = e.fileOf.get(c)
    if (pid !== undefined) return pid
    if (own(e.st.files, c)) {
      if (!e.disk.has(c) || !e.changed.has(c)) return e.st.files[c].project
    }
  }
  return ''
}

/** The folder whose project is a file's parent: its own folder, or for a folder note X/X.md the folder holding X. */
function parentDirOf(p: string): string {
  let dir = dirOf(p)
  if (dir === '.') return ''
  if (baseOf(dir) === stem(p)) {
    dir = dirOf(dir)
    if (dir === '.') return ''
  }
  return dir
}

function projectCycle(e: Engine, pid: string, parent: string): boolean {
  const seen = new Set<string>()
  for (let cur = parent; cur !== ''; cur = S.str(S.get(e.app, 'project', cur), 'parent_id')) {
    if (cur === pid || seen.has(cur)) return true
    seen.add(cur)
  }
  return false
}

/** A renamed file renames its project, a moved one moves it, edited front matter sets its colour, icon, flow and status. */
function projectEdits(e: Engine, m: MergeRun, p: string, d: Doc): void {
  const pid = d.id
  if (S.get(e.base, 'project', pid) === undefined) return
  const b = () => e.body('project', pid)
  const name = stem(p)
  const bp = m.baseLayout.get(pid)
  if (bp !== undefined && stem(bp) !== name) {
    const baseName = m.bv.text('project', pid, 'name')
    const appName = m.av.text('project', pid, 'name')
    if (m.av.undecryptable.has(`project:${pid}:name`)) {
      // not renamed: the name does not open
    } else if (appName !== baseName && safeName(appName) !== name) e.warn(`${p}: the project was renamed in the app and in the file; the app's name ${goQuote(appName)} is kept`)
    else if (safeName(appName) !== name) {
      b().set('name', name)
      e.event('project', p, '', `renamed project ${goQuote(appName)} to ${goQuote(name)}`)
    }
  }
  const fileParent = folderProject(e, parentDirOf(p))
  const baseParent = m.bv.parentOf(pid)
  const appParent = m.av.parentOf(pid)
  if (fileParent !== baseParent && fileParent !== appParent) {
    if (appParent !== baseParent) e.warn(`${p}: the project was moved in the app and in the file; the app's place is kept`)
    else if (projectCycle(e, pid, fileParent)) e.warn(`${p}: the folder would put the project inside itself; it is not moved`)
    else {
      b().set('parent_id', nullable(fileParent))
      e.event('project', p, '', `moved project ${goQuote(m.av.text('project', pid, 'name'))}`)
    }
  }
  const baseRow = S.get(e.base, 'project', pid)
  const appRow = S.get(e.app, 'project', pid)
  if (d.color !== S.str(baseRow, 'color') && d.color !== '' && S.str(appRow, 'color') === S.str(baseRow, 'color')) {
    if (COLOR.test(d.color)) b().set('color', d.color)
    else e.warn(`${p}: ${KEY_COLOR} ${goQuote(d.color)} is not a colour like #22c55e`)
  }
  if (d.icon !== S.str(baseRow, 'icon') && S.str(appRow, 'icon') === S.str(baseRow, 'icon')) b().set('icon', nullable(d.icon))
  let baseFlow = fileFlow(S.str(baseRow, 'flow_mode'))
  if (baseFlow === '?') baseFlow = ''
  if (d.unknownFlow !== '') e.warn(`${p}: ${KEY_FLOW} ${goQuote(d.unknownFlow)} is not a flow (sequential or area); it is left as it is`)
  else if (d.flow !== baseFlow && S.str(appRow, 'flow_mode') === S.str(baseRow, 'flow_mode')) b().set('flow_mode', d.flow === '' ? 'parallel' : d.flow)
  statusEdit(e, p, d, S.str(baseRow, 'status'), S.str(appRow, 'status'), b)
}

function statusEdit(e: Engine, p: string, d: Doc, baseStored: string, appStored: string, body: () => Map<string, unknown>): void {
  let base = fileStatus(baseStored)
  if (base === '?') base = ''
  if (d.unknownStatus !== '') {
    e.warn(`${p}: ${KEY_STATUS} ${goQuote(d.unknownStatus)} is not a status (maintenance); it is left as it is`)
    return
  }
  if (d.status !== base && appStored === baseStored) body().set('status', d.status === '' ? 'active' : d.status)
}

/** Creates the project of a file without a known opentodo-id. */
function newProject(e: Engine, p: string): void {
  const id = e.newID('project', p)
  const name = stem(p)
  const parent = folderProject(e, parentDirOf(p))
  let pos = 0
  for (const pid of S.ids(e.app, 'project')) {
    const r = S.get(e.app, 'project', pid)
    if (S.str(r, 'parent_id') === parent && S.num(r, 'position') >= pos) pos = S.num(r, 'position') + 1000
  }
  const b = e.body('project', id)
  b.set('name', name)
  b.set('color', defaultColor(name))
  b.set('position', pos)
  b.set('archived', false)
  b.set('parent_id', nullable(parent))
  b.set('icon', null)
  b.set('created_at', e.nowMS())
  b.set('deleted_at', null)
  e.fresh.add('project:' + id)
  e.fileOf.set(p, id)
  e.event('project', p, '', `created project ${goQuote(name)}`)
}

/** Finds or creates the section a heading names. */
function sectionOf(e: Engine, m: MergeRun, pid: string, name: string): string {
  if (pid === '') return ''
  const key = `${pid}\x00${name.toLowerCase()}`
  const known = m.sections.get(key)
  if (known !== undefined) return known
  for (const s of m.av.sectionsOf(pid)) {
    if (m.av.text('section', s, 'name').toLowerCase() === name.toLowerCase()) {
      m.sections.set(key, s)
      return s
    }
  }
  const id = e.newID('section', pid, name.toLowerCase())
  let pos = 0
  for (const s of S.ids(e.app, 'section')) {
    const r = S.get(e.app, 'section', s)
    if (S.str(r, 'project_id') === pid && S.num(r, 'position') >= pos) pos = S.num(r, 'position') + 1000
  }
  for (const s of m.sections.values()) {
    const b = e.peek('section', s)
    if (b && b.get('project_id') === pid) {
      const bp = b.get('position')
      if (typeof bp === 'number' && bp >= pos) pos = bp + 1000
    }
  }
  const b = e.body('section', id)
  b.set('name', name)
  b.set('project_id', pid)
  b.set('position', pos)
  b.set('created_at', e.nowMS())
  b.set('deleted_at', null)
  b.set('color', null)
  b.set('icon', null)
  e.fresh.add('section:' + id)
  m.sections.set(key, id)
  e.event('section', '', '', `created section ${goQuote(name)}`)
  return id
}

/** Gives new lines their ids, keeps lines with an unknown id as text and records where every task line sits. */
function placeTasks(e: Engine, m: MergeRun): void {
  const seen = new Map<string, number>()
  const taken = new Set<string>()
  for (const p of sortedKeys(e.parsed)) {
    const d = e.parsed.get(p)!
    const pid = e.fileOf.get(p) ?? ''
    const unknown: string[] = []
    walk(d, (_b, _parent, n) => {
      let id = n.line.id
      if (id !== '' && taken.has(id)) {
        e.warn(`${p}: the task ${short(id)} appears twice; the second line becomes a new task`)
        id = ''
      } else if (id !== '' && S.get(e.app, 'task', id) === undefined) {
        e.warn(`${p}: the task id ${id} is not in the account; the line is left as it is`)
        unknown.push(id)
        return
      }
      if (id === '') {
        const raw = goTrim(n.raw)
        const k = `${p}\x00${raw}`
        seen.set(k, (seen.get(k) ?? 0) + 1)
        id = e.newID('task', p, raw, String(seen.get(k)))
        n.line.id = id
        e.fresh.add('task:' + id)
      }
      taken.add(id)
    })
    demote(d, unknown)
    const walkErrs: Error[] = []
    walk(d, (b, parent, n) => {
      const sec = b.heading ? sectionOf(e, m, pid, b.section) : ''
      const pl: Place = { path: p, project: pid, parent: '', section: sec, node: n }
      let key = `${p}\x00top\x00${sec}`
      if (parent) {
        pl.parent = parent.line.id
        key = `${p}\x00child\x00${parent.line.id}`
      }
      if (utf8(noteText(n)).length > MAX_NOTE_BYTES && walkErrs.length === 0) {
        walkErrs.push(new LimitError(`${p}: the note of ${goQuote(n.line.title)} is larger than 64 KB, the limit for a note`))
      }
      m.placed.set(n.line.id, pl)
      if (!m.groups.has(key)) {
        m.groupKeys.push(key)
        m.groups.set(key, [])
      }
      m.groups.get(key)!.push(n.line.id)
    })
    if (walkErrs.length > 0) throw walkErrs[0]
  }
}

/** Task lines with an unknown id become prose at their place. */
function demote(d: Doc, unknown: string[]): void {
  if (unknown.length === 0) return
  const bad = new Set(unknown)
  const prune = (n: Node): string[][] => {
    const out: string[][] = []
    const kept: Node[] = []
    for (const c of n.children) {
      if (bad.has(c.line.id)) {
        out.push(rawLines(c, ''))
        continue
      }
      out.push(...prune(c))
      kept.push(c)
    }
    n.children = kept
    return out
  }
  for (const b of d.blocks) {
    const items: Item[] = []
    for (const it of b.items) {
      if (!it.task) {
        items.push(it)
        continue
      }
      if (bad.has(it.task.line.id)) {
        items.push({ prose: rawLines(it.task, '') })
        continue
      }
      items.push(it)
      for (const p of prune(it.task)) items.push({ prose: p })
    }
    b.items = items
  }
}

/** A node as it was in the file. */
function rawLines(n: Node, indent: string): string[] {
  const out = [indent + trimIndent(n.raw)]
  for (const l of n.note) out.push(goTrim(l) === '' ? '' : indent + '  ' + noteToFile(l))
  for (const c of n.children) out.push(...rawLines(c, indent + '  '))
  return out
}

/** Tasks whose line left a changed file: trashed when the app did not change them, written back otherwise (D7). */
function removedLines(e: Engine, m: MergeRun): void {
  const children = new Map<string, string[]>()
  for (const id of S.ids(e.app, 'task')) {
    const r = S.get(e.app, 'task', id)
    if (S.live(r) && S.str(r, 'parent_id') !== '') {
      const p = S.str(r, 'parent_id')
      children.set(p, [...(children.get(p) ?? []), id])
    }
  }
  for (const id of sortedKeys(e.st.printed)) {
    const p = e.st.printed[id]
    if (!e.parsed.has(p) || m.placed.has(id)) continue
    const b = S.get(e.base, 'task', id)
    const a = S.get(e.app, 'task', id)
    if (!S.live(a)) continue
    const title = m.av.text('task', id, 'title')
    if (b !== undefined && S.isSet(b, 'completed_at') && S.isSet(a, 'completed_at')) {
      delete e.st.printed[id]
      continue
    }
    if (b === undefined || !sameProj(proj(m.bv, id), proj(m.av, id))) {
      e.event('restored', p, id, `${goQuote(title)} changed in the app, so its line was written back to ${p}`)
      continue
    }
    const trash = (id: string) => {
      const pending = e.peek('task', id)?.get('deleted_at')
      if (m.placed.has(id) || (pending !== undefined && pending !== null)) return
      e.body('task', id).set('deleted_at', e.nowMS())
      e.rep.trashed++
      e.event('trashed', p, id, `trashed ${goQuote(m.av.text('task', id, 'title'))}`)
      for (const c of children.get(id) ?? []) trash(c)
    }
    trash(id)
  }
}

/** The lines of one sibling group get the file's order with as few position changes as possible (D8). */
function positions(e: Engine, m: MergeRun, group: string[]): void {
  const known = group.filter((id) => !e.fresh.has('task:' + id) && !m.moved.has(id))
  if (known.length === group.length) {
    const inBase = [...known]
    sortByPosition(e.base, 'task', inBase)
    if (known.every((id, i) => id === inBase[i])) return
  }
  const byApp = [...known]
  sortByPosition(e.app, 'task', byApp)
  const rank = new Map(byApp.map((id, i) => [id, i]))
  let keep = lis(known, rank)
  if (e.takeOver) keep = new Set(known)
  const pos = (id: string): number => {
    const p = e.peek('task', id)?.get('position')
    if (typeof p === 'number') return p
    return S.num(S.get(e.app, 'task', id), 'position')
  }
  for (let i = 0; i < group.length; ) {
    if (keep.has(group[i])) {
      i++
      continue
    }
    let j = i
    while (j < group.length && !keep.has(group[j])) j++
    const n = j - i
    for (let k = 0; k < n; k++) {
      let p: number
      if (i > 0 && j < group.length) {
        const lo = pos(group[i - 1])
        const hi = pos(group[j])
        p = lo + ((hi - lo) * (k + 1)) / (n + 1)
      } else if (i > 0) p = pos(group[i - 1]) + 1000 * (k + 1)
      else if (j < group.length) p = pos(group[j]) - 1000 * (n - k)
      else p = 1000 * (k + 1)
      const id = group[i + k]
      if (e.fresh.has('task:' + id) || S.num(S.get(e.app, 'task', id), 'position') !== p) e.body('task', id).set('position', p)
    }
    i = j
  }
}

/** The longest subsequence of seq increasing in rank. */
function lis(seq: string[], rank: Map<string, number>): Set<string> {
  const n = seq.length
  const length = new Array<number>(n).fill(1)
  const prev = new Array<number>(n).fill(-1)
  let best = -1
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (rank.get(seq[j])! < rank.get(seq[i])! && length[j] + 1 > length[i]) {
        length[i] = length[j] + 1
        prev[i] = j
      }
    }
    if (best < 0 || length[i] > length[best]) best = i
  }
  const out = new Set<string>()
  for (let i = best; i >= 0; i = prev[i]) out.add(seq[i])
  return out
}
