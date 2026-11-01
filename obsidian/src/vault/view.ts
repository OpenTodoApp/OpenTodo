// Reading a store for printing (internal/vault/layout.go, render.go, status.go):
// decrypted text, the project tree, file names, task lines and documents.
import { estimateMinutes, type Line } from './line'
import { emptyDoc, fileFlow, fileStatus, goFields, goTrim, trimNewlines, type Block, type Doc, type Node } from './doc'
import { byteOrder, goSprint, utf8 } from './gojson'
import * as S from './store'
import { localDate } from './zone'

export const INBOX_FILE = 'Inbox.md'
export const PLACEHOLDER = 'Encrypted item'
export const CIPHER_PREFIX = 'enc:'

/** Plaintext of ciphertext values, opened before the run (the engine keeps it). */
export type Plain = (entity: string, id: string, field: string, value: string) => string | null

export const isCiphertext = (s: string) => s.startsWith(CIPHER_PREFIX)
export const storedPart = (p: string) => p === 'morning' || p === 'afternoon'
export const validEnergy = (e: string) => e === 'deep' || e === 'medium' || e === 'low'

/** path.Join of a folder and a name without slashes. */
export const join = (dir: string, name: string) => (dir === '' ? name : `${dir}/${name}`)

export class View {
  /** entity:id:field values that did not open. */
  undecryptable = new Set<string>()

  constructor(public s: S.Store, private plain: Plain | null, public zone: string, public shared: Set<string>) {}

  /** A content string, decrypted. */
  text(entity: string, id: string, field: string): string {
    const raw = S.str(S.get(this.s, entity, id), field)
    if (!isCiphertext(raw)) return raw
    if (this.plain) {
      const pt = this.plain(entity, id, field, raw)
      if (pt !== null) return pt
    }
    this.undecryptable.add(`${entity}:${id}:${field}`)
    return PLACEHOLDER
  }

  /** A project that has a file: live and not archived. */
  projectLive(id: string): boolean {
    const r = S.get(this.s, 'project', id)
    return S.live(r) && !S.bool(r, 'archived')
  }

  /** A project's parent in the tree: live and unarchived, cycles broken. */
  parentOf(id: string): string {
    const seen = new Set([id])
    const p = S.str(S.get(this.s, 'project', id), 'parent_id')
    if (p === '' || !this.projectLive(p)) return ''
    for (let cur = p; cur !== ''; cur = S.str(S.get(this.s, 'project', cur), 'parent_id')) {
      if (seen.has(cur)) return ''
      seen.add(cur)
      if (!this.projectLive(cur)) break
    }
    return p
  }

  /** Every live project's file (design D3); the Inbox is Inbox.md. */
  layout(): Map<string, string> {
    const out = new Map<string, string>([['', INBOX_FILE]])
    const children = new Map<string, string[]>()
    for (const id of S.ids(this.s, 'project')) {
      if (!this.projectLive(id)) continue
      const p = this.parentOf(id)
      children.set(p, [...(children.get(p) ?? []), id])
    }
    const place = (parent: string, dir: string, taken: Set<string>) => {
      const ids = children.get(parent) ?? []
      sortByPosition(this.s, 'project', ids)
      for (const id of ids) {
        const base = safeName(this.text('project', id, 'name'))
        let name = base
        for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} ${n}`
        taken.add(name.toLowerCase())
        if ((children.get(id) ?? []).length > 0) {
          const sub = join(dir, name)
          out.set(id, join(sub, name + '.md'))
          place(id, sub, new Set([name.toLowerCase()]))
        } else out.set(id, join(dir, name + '.md'))
      }
    }
    place('', '', new Set(['inbox']))
    return out
  }

  /** Tag slugs to live label ids, the first by position winning. */
  labelSlugs(): Map<string, string> {
    const ids = S.ids(this.s, 'label').filter((id) => S.live(S.get(this.s, 'label', id)))
    sortByPosition(this.s, 'label', ids)
    const out = new Map<string, string>()
    for (const id of ids) {
      const sl = slug(this.text('label', id, 'name'))
      if (!out.has(sl) && sl !== '') out.set(sl, id)
    }
    return out
  }

  localDate(ms: number): string {
    return localDate(Math.trunc(ms), this.zone)
  }

  /** A task row as its file line, without nesting (design D4). */
  line(id: string, labels: Map<string, string>, extra: string): Line {
    const r = S.get(this.s, 'task', id)
    const l: Line = {
      indent: '', done: false, title: this.text('task', id, 'title'), trailing: extra, due: '', start: '', doneDate: '', created: '', recur: '', priority: 0, id,
      blocked: [], tags: [], time: '', tz: '', deadline: '', estimate: '', evening: false, span: '', dayPart: '', energy: '', readOnly: {}, has: {},
    }
    if (S.isSet(r, 'completed_at')) {
      l.done = true
      l.doneDate = this.localDate(S.num(r, 'completed_at'))
    }
    const d = S.dueOf(r)
    if (d) {
      l.due = d.date
      if (d.time !== undefined) {
        l.time = d.time
        if (d.tz !== undefined) l.tz = d.tz
      }
    }
    l.start = S.str(r, 'start')
    l.deadline = S.str(r, 'deadline')
    const m = Math.trunc(S.num(r, 'estimate_minutes'))
    if (m > 0) l.estimate = formatMinutes(m)
    l.evening = S.bool(r, 'evening')
    const part = S.str(r, 'day_part')
    if (!l.evening && storedPart(part)) l.dayPart = part
    const e = S.str(r, 'energy')
    if (validEnergy(e)) l.energy = e
    if (S.bool(r, 'span')) l.span = 'true'
    const p = Math.trunc(S.num(r, 'priority'))
    if (p >= 1 && p <= 3) l.priority = p
    const rule = S.str(r, 'recurrence')
    if (rule) l.recur = ruleToFile(rule)
    const byID = new Map<string, string>()
    for (const [sl, lid] of labels) byID.set(lid, sl)
    for (const lid of S.strs(r, 'labels')) {
      const sl = byID.get(lid)
      if (sl !== undefined) l.tags.push(sl)
    }
    l.blocked.push(...S.strs(r, 'blocked_by'))
    Object.assign(l.readOnly, this.readOnly(id))
    return l
  }

  /** What the file shows but never pushes: origin, location, tracked minutes, custom fields. */
  readOnly(id: string): Record<string, string> {
    const out: Record<string, string> = {}
    const r = S.get(this.s, 'task', id)
    const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
    const strField = (o: Record<string, unknown>, k: string): string | null => {
      const v = o[k]
      if (v === undefined || v === null) return ''
      return typeof v === 'string' ? v : null
    }
    for (const [key, a, b] of [['origin', 'url', 'id'], ['location', 'name', 'address']] as const) {
      if (!S.isSet(r, key)) continue
      const raw = S.rawOf(r, key)
      const o = obj(raw)
      if (o) {
        const x = strField(o, a)
        const y = strField(o, b)
        if (x !== null && y !== null && (x !== '' || y !== '')) out[key] = x || y
      } else if (typeof raw === 'string' && raw !== '') out[key] = this.text('task', id, key)
    }
    let tracked = 0
    for (const eid of S.ids(this.s, 'time_entry')) {
      const e = S.get(this.s, 'time_entry', eid)
      if (S.str(e, 'task_id') !== id || !S.live(e) || !S.isSet(e, 'ended_at')) continue
      tracked += Math.trunc((S.num(e, 'ended_at') - S.num(e, 'started_at')) / 60000)
    }
    if (tracked > 0) out.tracked = formatMinutes(tracked)
    const pid = S.str(r, 'project_id')
    if (pid !== '') {
      for (const fid of S.ids(this.s, 'field')) {
        const f = S.get(this.s, 'field', fid)
        if (!S.live(f) || S.str(f, 'project_id') !== pid) continue
        const key = 'fields.' + fid
        if (!S.isSet(r, key)) continue
        const val = S.rawOf(r, key)
        const s = typeof val === 'string' ? this.text('task', id, key) : goSprint(val)
        const name = this.text('field', fid, 'name').replace(/[[\]:]/g, '')
        out['field:' + name] = s.replaceAll(']', '')
      }
    }
    return out
  }

  /** The tasks a project file shows: live, open or still holding their line. */
  fileTasks(project: string, printed: ((id: string) => boolean) | null): string[] {
    const out: string[] = []
    for (const id of S.ids(this.s, 'task')) {
      const r = S.get(this.s, 'task', id)
      if (!S.live(r) || S.str(r, 'project_id') !== project) continue
      if (S.isSet(r, 'completed_at') && (!printed || !printed(id))) continue
      out.push(id)
    }
    return out
  }

  /** A project's live sections in order. */
  sectionsOf(project: string): string[] {
    if (project === '') return []
    const out = S.ids(this.s, 'section').filter((id) => {
      const r = S.get(this.s, 'section', id)
      return S.live(r) && S.str(r, 'project_id') === project
    })
    sortByPosition(this.s, 'section', out)
    return out
  }

  /** A task whose parent chain loops back to it. */
  cyclic(id: string): boolean {
    const seen = new Set([id])
    for (let cur = S.str(S.get(this.s, 'task', id), 'parent_id'); cur !== ''; cur = S.str(S.get(this.s, 'task', cur), 'parent_id')) {
      if (seen.has(cur)) return true
      seen.add(cur)
    }
    return false
  }

  /** A project's document (design D8). */
  render(inp: RenderInput): Doc {
    const d = emptyDoc()
    if (inp.project !== '') {
      const r = S.get(this.s, 'project', inp.project)
      d.id = inp.project
      d.color = S.str(r, 'color')
      d.icon = S.str(r, 'icon')
      d.flow = renderedFlow(S.str(r, 'flow_mode'), inp.tmpl)
      d.status = renderedStatus(S.str(r, 'status'), inp.tmpl)
      d.hasFront = true
    }
    if (inp.tmpl) {
      d.front.push(...inp.tmpl.front)
      if (inp.project === '' && inp.tmpl.hasFront) d.hasFront = true
    }
    let ids = this.fileTasks(inp.project, inp.printed)
    if (inp.skip.size > 0) ids = ids.filter((id) => !inp.skip.has(id))
    const inFile = new Set(ids)
    const sections = this.sectionsOf(inp.project)
    const liveSection = new Set(sections)
    const children = new Map<string, string[]>()
    const top = new Map<string, string[]>()
    for (const id of ids) {
      const r = S.get(this.s, 'task', id)
      const p = S.str(r, 'parent_id')
      if (p !== '' && inFile.has(p) && !this.cyclic(id)) {
        children.set(p, [...(children.get(p) ?? []), id])
        continue
      }
      let sec = S.str(r, 'section_id')
      if (!liveSection.has(sec)) sec = ''
      top.set(sec, [...(top.get(sec) ?? []), id])
    }
    const node = (id: string): Node => {
      const n: Node = { line: this.line(id, inp.labels, inp.extra[id] ?? ''), note: [], children: [], raw: '' }
      const desc = this.text('task', id, 'description')
      if (goTrim(desc) !== '') n.note = trimNewlines(desc).split('\n')
      const kids = children.get(id) ?? []
      sortByPosition(this.s, 'task', kids)
      for (const c of kids) n.children.push(node(c))
      return n
    }
    const tmplBlocks = new Map<string, Block>()
    let tmplFirst: Block | null = null
    if (inp.tmpl) {
      for (const b of inp.tmpl.blocks) {
        if (!b.heading) {
          if (!tmplFirst) tmplFirst = b
          continue
        }
        tmplBlocks.set(b.section.toLowerCase(), b)
      }
    }
    const used = new Set<Block>()
    const build = (heading: boolean, name: string, sec: string, tb: Block | null | undefined): Block => {
      const b: Block = { heading, section: name, items: [] }
      const ordered = top.get(sec) ?? []
      sortByPosition(this.s, 'task', ordered)
      const present = new Set(ordered)
      const anchored = new Map<string, string[][]>()
      const start: string[][] = []
      if (tb) {
        used.add(tb)
        let anchor = ''
        for (const it of tb.items) {
          if (it.task) {
            if (present.has(it.task.line.id)) anchor = it.task.line.id
            continue
          }
          if (anchor === '') start.push(it.prose!)
          else anchored.set(anchor, [...(anchored.get(anchor) ?? []), it.prose!])
        }
      }
      for (const p of start) b.items.push({ prose: p })
      for (const id of ordered) {
        b.items.push({ task: node(id) })
        for (const p of anchored.get(id) ?? []) b.items.push({ prose: p })
      }
      return b
    }
    d.blocks.push(build(false, '', '', tmplFirst))
    for (const sec of sections) {
      const name = this.text('section', sec, 'name')
      d.blocks.push(build(true, name, sec, tmplBlocks.get(name.toLowerCase())))
    }
    if (inp.tmpl) {
      for (const b of inp.tmpl.blocks) {
        if (!b.heading || used.has(b)) continue
        const prose: string[] = []
        for (const it of b.items) if (it.prose) prose.push(...it.prose)
        if (prose.length > 0) d.blocks[0].items.push({ prose: ['## ' + b.section, '', ...prose] })
      }
    }
    return d
  }
}

export interface RenderInput {
  project: string
  tmpl: Doc | null
  printed: ((id: string) => boolean) | null
  extra: Record<string, string>
  labels: Map<string, string>
  skip: Set<string>
}

/** Orders ids by (position, id), the manual order rule. */
export function sortByPosition(s: S.Store, entity: string, ids: string[]): void {
  ids.sort((x, y) => {
    const a = S.num(S.get(s, entity, x), 'position')
    const b = S.num(S.get(s, entity, y), 'position')
    if (a !== b) return a < b ? -1 : 1
    return byteOrder(x, y)
  })
}

/** A project name as a file name (design D3). */
export function safeName(name: string): string {
  let b = ''
  for (const ch of name) b += '/\\:*?"<>|'.includes(ch) || /\p{Cc}/u.test(ch) ? '-' : ch
  b = b.replace(/[. ]+$/, '').replace(/^ +/, '')
  return b === '' ? 'Untitled' : b
}

/** A label's tag: its name with spaces as -, lower case. */
export function slug(name: string): string {
  return goFields(name).join('-').toLowerCase()
}

/** 45m, 1h30m, 2h. */
export function formatMinutes(m: number): string {
  if (m < 60) return `${m}m`
  if (m % 60 === 0) return `${m / 60}h`
  return `${Math.floor(m / 60)}h${m % 60}m`
}

/** A duration of 1 minute to 7 days. */
export function parseMinutes(s: string): number | null {
  return estimateMinutes(s)
}

export function ruleToFile(rule: string): string {
  return rule.replace(' after completion', ' when done')
}

/** The opentodo-flow a file gets. */
export function renderedFlow(stored: string, tmpl: Doc | null): string {
  const f = fileFlow(stored)
  return f !== '?' && (!tmpl || tmpl.unknownFlow === '') ? f : ''
}

export function renderedStatus(stored: string, tmpl: Doc | null): string {
  const s = fileStatus(stored)
  return s !== '?' && (!tmpl || tmpl.unknownStatus === '') ? s : ''
}

/** The colour `ot project add` derives from a name (FNV-1a). */
export function defaultColor(name: string): string {
  const palette = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899']
  let h = 0x811c9dc5
  for (const b of utf8(name)) {
    h ^= b
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return palette[h % palette.length]
}
