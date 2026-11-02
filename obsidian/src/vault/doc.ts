// One parsed project file (internal/vault/doc.go, status.go): front matter,
// then blocks (the part before the first section heading, then one per
// section), each holding prose chunks and task trees in file order.
import { parseLine, printLine, taskLineParts, type Line } from './line'

export interface Doc {
  /** The front matter lines the vault does not own, in order. */
  front: string[]
  hasFront: boolean
  id: string
  color: string
  icon: string
  flow: string
  unknownFlow: string
  status: string
  unknownStatus: string
  blocks: Block[]
}

export interface Block {
  heading: boolean
  section: string
  items: Item[]
}

/** A prose chunk or a top-level task tree. */
export interface Item {
  prose?: string[]
  task?: Node
}

export interface Node {
  line: Line
  note: string[]
  children: Node[]
  /** The line as written, for the conflict file. */
  raw: string
}

export const KEY_ID = 'opentodo-id'
export const KEY_COLOR = 'opentodo-color'
export const KEY_ICON = 'opentodo-icon'
export const KEY_FLOW = 'opentodo-flow'
export const KEY_STATUS = 'opentodo-status'

const HEADING = /^##[ \t]+([^\n]+?)[ \t]*#*[ \t]*$/
const ANY_HEADING = /^#{1,6}[ \t]/
const FRONT_KEY = /^([A-Za-z0-9_-]+):[ \t]*([^\n]*)$/
const NOTE_DASH_BOX = /^([ \t]*)- \[([ xX])\]/
const NOTE_STAR_BOX = /^([ \t]*)\* \[([ xX])\]/

const SPACE_CLASS = '\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000'
const TRIM = new RegExp(`^[${SPACE_CLASS}]+|[${SPACE_CLASS}]+$`, 'g')
const TRIM_RIGHT = new RegExp(`[${SPACE_CLASS}]+$`)
const FIELDS = new RegExp(`[${SPACE_CLASS}]+`)

/** Go's strings.TrimSpace (unicode.IsSpace). */
export const goTrim = (s: string) => s.replace(TRIM, '')
export const goTrimRight = (s: string) => s.replace(TRIM_RIGHT, '')
/** Go's strings.Fields. */
export const goFields = (s: string) => goTrim(s).split(FIELDS).filter((x) => x !== '')
/** strings.TrimLeft(s, " \t"). */
export const trimIndent = (s: string) => s.replace(/^[ \t]+/, '')
/** strings.TrimRight(s, "\n"). */
export const trimNewlines = (s: string) => s.replace(/\n+$/, '')

export function isTaskLine(s: string): { indent: string; done: boolean; content: string } | null {
  return taskLineParts(s)
}

/** The indentation width with a tab counted as two spaces. */
export function widthOf(indent: string): number {
  let w = 0
  for (const ch of indent) w += ch === '\t' ? 2 : 1
  return w
}

/** fileFlow: "" for Parallel, sequential or area, "?" for a value the vault does not know. */
export function fileFlow(v: string): string {
  if (v === '' || v === 'parallel') return ''
  if (v === 'sequential' || v === 'area') return v
  return '?'
}

/** fileStatus: "" for active, maintenance, "?" for a value the vault does not know. */
export function fileStatus(v: string): string {
  if (v === '' || v === 'active') return ''
  if (v === 'maintenance') return v
  return '?'
}

function unquote(v: string): string {
  v = goTrim(v)
  if (v.length >= 2 && ((v[0] === '"' && v[v.length - 1] === '"') || (v[0] === "'" && v[v.length - 1] === "'"))) return v.slice(1, -1)
  return v
}

/** Whether a task line comes before the next heading. */
function tasksFollow(rest: string[]): boolean {
  for (const l of rest) {
    if (ANY_HEADING.test(l)) return false
    if (isTaskLine(l)) return true
  }
  return false
}

interface Frame {
  node: Node
  width: number
}

const leadingSpace = (s: string) => s.slice(0, s.length - trimIndent(s).length)

/** The index in stack of the task a non-task line is a note of (-1: none), and whether to skip it. */
function noteTarget(line: string, rest: string[], stack: Frame[]): [number, boolean] {
  let probe = line
  if (goTrim(line) === '') {
    probe = ''
    for (const l of rest) {
      if (goTrim(l) !== '') {
        probe = l
        break
      }
    }
    if (probe === '') return [-1, false]
    if (isTaskLine(probe)) {
      const pw = widthOf(leadingSpace(probe))
      return [-1, pw > 0 && pw > stack[0].width]
    }
  }
  const w = widthOf(leadingSpace(probe))
  for (let i = stack.length - 1; i >= 0; i--) if (w > stack[i].width) return [i, false]
  return [-1, false]
}

/** Removes up to width columns of indentation. */
function dedent(s: string, width: number): string {
  let w = 0
  let i = 0
  for (const ch of s) {
    if (w >= width) return s.slice(i)
    if (ch === ' ') w++
    else if (ch === '\t') w += 2
    else return s.slice(i)
    i += ch.length
  }
  return ''
}

export const noteToFile = (s: string) => s.replace(NOTE_DASH_BOX, '$1* [$2]')
const noteFromFile = (s: string) => s.replace(NOTE_STAR_BOX, '$1- [$2]')

function finishNotes(n: Node): void {
  while (n.note.length > 0 && goTrim(n.note[n.note.length - 1]) === '') n.note.pop()
  const width = widthOf(n.line.indent) + 2
  n.note = n.note.map((l) => (goTrim(l) === '' ? '' : noteFromFile(dedent(l, width))))
  for (const c of n.children) finishNotes(c)
}

export const noteText = (n: Node) => n.note.join('\n')

export function emptyDoc(): Doc {
  return { front: [], hasFront: false, id: '', color: '', icon: '', flow: '', unknownFlow: '', status: '', unknownStatus: '', blocks: [] }
}

/**
 * Parses a project file. isSection reports whether a heading names a section
 * of the file's project; a `##` heading is a section heading when it does or
 * when task lines follow it before the next heading, otherwise it is prose.
 */
export function parseDoc(text: string, isSection: ((name: string) => boolean) | null): Doc {
  text = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
  let lines = text.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines = lines.slice(0, -1)
  const d = emptyDoc()
  let i = 0
  if (lines.length > 0 && goTrim(lines[0]) === '---') {
    for (let j = 1; j < lines.length; j++) {
      if (goTrim(lines[j]) !== '---') continue
      d.hasFront = true
      for (const l of lines.slice(1, j)) {
        const m = FRONT_KEY.exec(l)
        const key = m?.[1]
        const val = m ? unquote(m[2]) : ''
        if (key === KEY_ID) d.id = val
        else if (key === KEY_COLOR) d.color = val
        else if (key === KEY_ICON) d.icon = val
        else if (key === KEY_FLOW && fileFlow(val) !== '?') d.flow = fileFlow(val)
        else if (key === KEY_FLOW) {
          d.unknownFlow = val
          d.front.push(l)
        } else if (key === KEY_STATUS && fileStatus(val) !== '?') d.status = fileStatus(val)
        else if (key === KEY_STATUS) {
          d.unknownStatus = val
          d.front.push(l)
        } else d.front.push(l)
      }
      i = j + 1
      break
    }
  }
  const body = lines.slice(i)
  let block: Block = { heading: false, section: '', items: [] }
  d.blocks.push(block)
  let prose: string[] = []
  const flushProse = () => {
    let a = 0
    let b = prose.length
    while (a < b && goTrim(prose[a]) === '') a++
    while (b > a && goTrim(prose[b - 1]) === '') b--
    if (b > a) block.items.push({ prose: prose.slice(a, b) })
    prose = []
  }
  let stack: Frame[] = []
  for (let k = 0; k < body.length; k++) {
    const line = body[k]
    const m = HEADING.exec(line)
    if (m) {
      const name = goTrim(m[1])
      if ((isSection && isSection(name)) || tasksFollow(body.slice(k + 1))) {
        flushProse()
        stack = []
        block = { heading: true, section: name, items: [] }
        d.blocks.push(block)
        continue
      }
    }
    const t = isTaskLine(line)
    if (t) {
      const w = widthOf(t.indent)
      while (stack.length > 0 && stack[stack.length - 1].width >= w) stack.pop()
      const n: Node = { line: parseLine(t.indent, t.done, t.content), note: [], children: [], raw: line }
      if (stack.length === 0) {
        flushProse()
        block.items.push({ task: n })
      } else stack[stack.length - 1].node.children.push(n)
      stack.push({ node: n, width: w })
      continue
    }
    if (stack.length > 0) {
      const [target, skip] = noteTarget(line, body.slice(k + 1), stack)
      if (skip) continue
      if (target >= 0) {
        const f = stack[target]
        stack = stack.slice(0, target + 1)
        f.node.note.push(line)
        continue
      }
      stack = []
    }
    prose.push(line)
  }
  flushProse()
  for (const b of d.blocks) for (const it of b.items) if (it.task) finishNotes(it.task)
  return d
}

function printNode(n: Node, indent: string): string[] {
  const out = [printLine({ ...n.line, indent })]
  for (const nl of n.note) out.push(goTrim(nl) === '' ? '' : indent + '  ' + noteToFile(nl))
  for (const c of n.children) out.push(...printNode(c, indent + '  '))
  return out
}

/** Writes a document: front matter, then each block's heading, prose chunks and task runs separated by one blank line. */
export function printDoc(d: Doc): string {
  let b = ''
  if (d.hasFront || d.id !== '') {
    b += '---\n'
    if (d.id) b += `${KEY_ID}: ${d.id}\n`
    if (d.color) b += `${KEY_COLOR}: "${d.color}"\n`
    if (d.icon) b += `${KEY_ICON}: ${d.icon}\n`
    if (d.flow) b += `${KEY_FLOW}: ${d.flow}\n`
    if (d.status) b += `${KEY_STATUS}: ${d.status}\n`
    for (const l of d.front) b += l + '\n'
    b += '---\n'
  }
  const chunks: string[] = []
  for (const bl of d.blocks) {
    if (bl.heading) chunks.push('## ' + bl.section)
    let run: string[] = []
    const flushRun = () => {
      if (run.length > 0) {
        chunks.push(run.join('\n'))
        run = []
      }
    }
    for (const it of bl.items) {
      if (it.task) {
        run.push(...printNode(it.task, it.task.line.indent))
        continue
      }
      flushRun()
      chunks.push(it.prose!.join('\n'))
    }
    flushRun()
  }
  if (chunks.length > 0) {
    if (b.length > 0) b += '\n'
    else if (goTrim(chunks[0].split('\n')[0]) === '---') b += '\n'
    b += chunks.join('\n\n') + '\n'
  }
  return b
}

/** Visits every task node with its block and parent. */
export function walk(d: Doc, fn: (b: Block, parent: Node | null, n: Node) => void): void {
  const visit = (b: Block, parent: Node | null, n: Node) => {
    fn(b, parent, n)
    for (const c of n.children) visit(b, n, c)
  }
  for (const b of d.blocks) for (const it of b.items) if (it.task) visit(b, null, it.task)
}
