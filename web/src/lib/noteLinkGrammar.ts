// The link grammar of notes (OpenSpec change note-links, design D1, D5): an
// internal link is Markdown link text whose address is `?note=<id>`, `?task=<id>`
// or `?project=<id>`. linksIn finds them in a projection, outside code spans and
// fenced blocks. The same scanner in Go is internal/notelinks, pinned by the
// shared vectors internal/notelinks/testdata/links.vectors.json.

export type LinkKind = 'note' | 'task' | 'project'

export interface NoteLink {
  kind: LinkKind
  id: string
  /** The link text as stored (escapes read). */
  label: string
  /** Where the link starts and ends in the text (UTF-16 units; not part of the vectors). */
  at: number
  end: number
}

const KINDS: readonly LinkKind[] = ['note', 'task', 'project']
const FENCE = /^ {0,3}(```+|~~~+)/
const PUNCT = /[!-/:-@[-`{-~]/
const ID = /[A-Za-z0-9_-]/

/** A line with its code spans blanked (same length), as markdown.ts reads them. */
function maskCode(line: string): string {
  if (!line.includes('`')) return line
  let out = ''
  let i = 0
  while (i < line.length) {
    if (line[i] !== '`') {
      out += line[i++]
      continue
    }
    let n = 0
    while (line[i + n] === '`') n++
    const run = '`'.repeat(n)
    const end = line.indexOf(run, i + n)
    if (end < 0) {
      out += run
      i += n
      continue
    }
    out += ' '.repeat(end + n - i)
    i = end + n
  }
  return out
}

function scanLine(line: string, offset: number, out: NoteLink[]): void {
  let i = line.indexOf('[')
  while (i >= 0) {
    let back = 0
    while (i - back - 1 >= 0 && line[i - back - 1] === '\\') back++
    const next = scanAt(line, i, back % 2 === 1)
    if (next) {
      out.push({ ...next.link, at: offset + i, end: offset + next.end })
      i = line.indexOf('[', next.end)
    } else i = line.indexOf('[', i + 1)
  }
}

function scanAt(line: string, i: number, escaped: boolean): { link: Omit<NoteLink, 'at' | 'end'>; end: number } | null {
  if (escaped) return null
  let j = i + 1
  let label = ''
  for (;;) {
    if (j >= line.length) return null
    const c = line[j]
    if (c === '\\' && j + 1 < line.length && PUNCT.test(line[j + 1])) {
      label += line[j + 1]
      j += 2
      continue
    }
    if (c === '[') return null
    if (c === ']') break
    label += c
    j++
  }
  if (!line.startsWith('(?', j + 1)) return null
  let k = j + 3
  const kind = KINDS.find((kd) => line.startsWith(`${kd}=`, k))
  if (!kind) return null
  k += kind.length + 1
  const start = k
  while (k < line.length && ID.test(line[k])) k++
  if (k === start || line[k] !== ')') return null
  return { link: { kind, id: line.slice(start, k), label }, end: k + 1 }
}

/** The internal links of a Markdown text, in order (duplicates kept). */
export function linksIn(markdown: string): NoteLink[] {
  if (!markdown || markdown.indexOf('](?') < 0) return []
  const out: NoteLink[] = []
  const text = markdown.replace(/\r\n?/g, '\n')
  let fence: string | null = null
  let offset = 0
  for (const line of text.split('\n')) {
    if (fence !== null) {
      if (line.trimStart().startsWith(fence)) fence = null
    } else {
      const f = FENCE.exec(line)
      if (f) fence = f[1]
      else if (line.includes('](?')) scanLine(maskCode(line), offset, out)
    }
    offset += line.length + 1
  }
  return out
}
