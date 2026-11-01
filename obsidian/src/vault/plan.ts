// Printing and writing the files (internal/vault/plan.go): which project files
// to print again, the writes, moves, removals and conflict files (D3, D7, D8).
import { parseDoc, printDoc, walk, type Doc } from './doc'
import type { Engine } from './engine'
import { byteOrder as byOrder, hashOf, own, sortedKeys } from './gojson'
import * as S from './store'
import { KEPT_ENTITIES } from './store'
import type { FileState } from './types'
import type { View } from './view'

const conflictName = (p: string) => p.replace(/\.md$/, '') + '.conflict.md'

/** The projects whose file must be printed again: changed on disk, moved by the layout, missing, or with rows the sync changed. */
function touched(e: Engine, layout: Map<string, string>, recorded: Map<string, string>): Set<string> {
  const t = new Set<string>()
  if (!e.st.initialized) {
    for (const pid of layout.keys()) t.add(pid)
    return t
  }
  for (const p of e.parsed.keys()) t.add(e.fileOf.get(p) ?? '')
  for (const [pid, p] of layout) if (!e.disk.has(p) || recorded.get(pid) !== p) t.add(pid)
  const add = (pid: string) => {
    if (layout.has(pid)) t.add(pid)
  }
  for (const entity of KEPT_ENTITIES) {
    const seen = new Set<string>()
    for (const s of [e.base, e.app]) {
      for (const id of Object.keys(s[entity] ?? {})) {
        if (seen.has(id)) continue
        seen.add(id)
        const b = S.get(e.base, entity, id)
        const a = S.get(e.app, entity, id)
        if (S.rowEqual(b, a)) continue
        switch (entity) {
          case 'task':
          case 'section':
          case 'field':
            add(S.str(b, 'project_id'))
            add(S.str(a, 'project_id'))
            break
          case 'project':
            add(id)
            add(S.str(b, 'parent_id'))
            add(S.str(a, 'parent_id'))
            break
          case 'time_entry':
            add(S.str(S.get(e.app, 'task', S.str(a, 'task_id')), 'project_id'))
            break
          case 'label':
            for (const pid of layout.keys()) t.add(pid)
            break
        }
      }
    }
  }
  return t
}

/** The file on disk that holds a project's lines. */
function sourceOf(e: Engine, pid: string, old: string, target: string): string {
  for (const p of sortedKeys(e.parsed)) if (e.fileOf.get(p) === pid) return p
  if (old !== '' && e.disk.has(old)) return old
  if (own(e.st.files, target) && e.st.files[target].project === pid) return target
  return ''
}

function sectionNames(v: View, pid: string): (n: string) => boolean {
  const names = new Set(v.sectionsOf(pid).map((s) => v.text('section', s, 'name').toLowerCase()))
  return (n) => names.has(n.toLowerCase())
}

/** Prints the touched project files and writes, moves and removes files; a dry run only lists them. */
export async function plan(e: Engine, dry: boolean): Promise<void> {
  const v = e.view(e.app)
  const layout = v.layout()
  const recorded = new Map<string, string>()
  for (const p of Object.keys(e.st.files)) recorded.set(e.st.files[p].project, p)
  const t = touched(e, layout, recorded)
  for (const pid of e.retouch) if (layout.has(pid)) t.add(pid)
  const printedBefore = { ...e.st.printed }
  const printed = (id: string) => own(printedBefore, id) && printedBefore[id] !== ''
  const labels = v.labelSlugs()
  const writes = new Map<string, string>()
  const files: Record<string, FileState> = { ...e.st.files }
  const removes: string[] = []
  const renames = new Map<string, string>()
  for (const pid of [...t].sort(byOrder)) {
    if (pid !== '' && !v.projectLive(pid)) continue
    const target = layout.get(pid) ?? ''
    const old = recorded.get(pid) ?? ''
    const src = sourceOf(e, pid, old, target)
    if (e.pending.has(src) || e.pending.has(old) || e.pending.has(target)) continue
    if (e.o.readOnly && (e.changed.has(src) || e.changed.has(target))) continue
    let tmpl: Doc | null = null
    if (e.parsed.has(src)) tmpl = e.parsed.get(src)!
    else if (e.disk.has(src)) tmpl = parseDoc(e.disk.get(src)!, sectionNames(v, pid))
    const doc = v.render({ project: pid, tmpl, printed, extra: e.st.extra ?? {}, labels, skip: new Set() })
    const out = printDoc(doc)
    for (const id of Object.keys(e.st.printed)) {
      const p = e.st.printed[id]
      if (p === src || p === old || p === target) delete e.st.printed[id]
    }
    walk(doc, (_b, _parent, n) => {
      e.st.printed[n.line.id] = target
    })
    const cur = e.disk.get(target)
    if (cur === undefined || cur !== out) {
      writes.set(target, out)
      e.rep.written++
      if (old === target && cur === undefined) e.event('restored', target, '', `restored ${target} from the app`)
      else e.event('written', target, '', `wrote ${target}`)
    }
    for (const p of [src, old]) {
      if (p !== '' && p !== target) {
        delete files[p]
        if (e.disk.has(p) && (e.parsed.has(p) || !e.changed.has(p))) removes.push(p)
      }
    }
    files[target] = { project: pid, hash: hashOf(out) }
  }
  for (const p of sortedKeys(e.st.files)) {
    const fs = e.st.files[p]
    if (e.pending.has(p) || fs.project === '' || v.projectLive(fs.project)) continue
    delete files[p]
    const b = e.disk.get(p)
    if (b === undefined) continue
    if (hashOf(b) === fs.hash) {
      removes.push(p)
      e.event('removed', p, '', `removed ${p}: the project is archived or trashed in the app`)
    } else renames.set(p, conflictName(p))
  }
  for (const p of e.pending) {
    if (own(files, p)) files[p] = { ...files[p], hash: '' }
  }
  for (const p of e.skip) {
    delete files[p]
    renames.set(p, conflictName(p))
  }
  for (const from of sortedKeys(renames)) {
    const to = renames.get(from)!
    e.rep.conflicts++
    e.event('conflict', to, '', `the project of ${from} is archived or trashed in the app, and the file was edited; it is now ${to}`)
  }
  e.rep.projects = layout.size - 1
  e.rep.tasks = e.countTasks(e.app)
  if (dry) {
    const listed = [...writes.keys(), ...e.conf.keys()].sort(byOrder)
    if (listed.length > 0) e.rep.files = listed
    return
  }
  await apply(e, writes, removes, renames)
  e.st.files = files
}

/** Writes the planned files, appends to conflict files and removes or renames what the plan says. */
async function apply(e: Engine, writes: Map<string, string>, removes: string[], renames: Map<string, string>): Promise<void> {
  const files = e.o.files
  for (const p of sortedKeys(writes)) await files.write(p, writes.get(p)!, e.disk.get(p) ?? null)
  for (const cp of sortedKeys(e.conf)) {
    let prev = (await files.read(cp)) ?? ''
    if (prev.length > 0 && !prev.endsWith('\n')) prev += '\n'
    await files.write(cp, prev + e.conf.get(cp)!.join('\n') + '\n')
  }
  for (const from of sortedKeys(renames)) {
    const to = renames.get(from)!
    let b = e.disk.get(from) ?? ''
    const prev = await files.read(to)
    if (prev !== null) b = prev + '\n' + b
    await files.write(to, b)
    removes.push(from)
  }
  const dirs = new Set<string>()
  for (const p of removes) {
    if (writes.has(p)) continue
    await files.remove(p)
    for (let d = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''; d !== ''; d = d.includes('/') ? d.slice(0, d.lastIndexOf('/')) : '') dirs.add(d)
  }
  const ds = sortedKeys(Object.fromEntries([...dirs].map((d) => [d, true])))
  ds.sort((a, b) => b.length - a.length)
  for (const d of ds) await files.removeDir(d)
}
