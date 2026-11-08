// Single-pointer alternatives to dragging (OpenSpec change accessibility-aa, design D3;
// WCAG 2.2 2.5.7 Dragging movements and 2.5.1 Pointer gestures). Every element of the web
// app that starts a drag, a resize or a swipe carries `data-drag-id`, and
// scripts/ux-audit/drag-alternatives.json links that id to the way to do the same with
// one click or tap: a menu item (its id must exist in the named file) or a control (a
// text the named file must contain). The scan looks at the opening tags of intrinsic
// elements: `draggable` (not `draggable={false}`), `onDragStart`, `onDrag` and
// `onPointerDown` other than a handler that only stops the event; the map's `notDrags`
// lists the pointer handlers that start no drag, with a reason.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, URL as NodeURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new NodeURL('../../../../', import.meta.url))
const src = join(root, 'web/src')

interface Alternative { file: string; item?: string; contains?: string }
interface Source { id: string; what: string; alternatives: Alternative[] }
interface NotDrag { file: string; contains: string; reason: string }
const map = JSON.parse(readFileSync(join(root, 'scripts/ux-audit/drag-alternatives.json'), 'utf8')) as { sources: Source[]; notDrags: NotDrag[] }

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return e.name === 'generated' ? [] : files(p)
    return /\.tsx$/.test(e.name) && !/\.(test|stories)\.tsx$/.test(e.name) ? [p] : []
  })
}

/** The end of the JSX opening tag that starts at `start` (`<`), skipping braces and strings. */
function tagEnd(text: string, start: number): number {
  let depth = 0
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i]
    // A comment between attributes (`// the project's fill`) is not a string.
    if (depth === 0 && text.startsWith('//', i)) { i = text.indexOf('\n', i); continue }
    if (depth === 0 && text.startsWith('/*', i)) { i = text.indexOf('*/', i) + 1; continue }
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (depth === 0 && (c === '"' || c === "'")) i = text.indexOf(c, i + 1)
    else if (depth === 0 && c === '>') return i
  }
  return text.length
}

/** Every intrinsic opening tag of a file, and every MoveHandle (a drag handle with its own menu): [tag text, line]. */
function intrinsicTags(text: string): Array<[string, number]> {
  const out: Array<[string, number]> = []
  for (const m of text.matchAll(/<([a-z][a-z0-9]*|MoveHandle)[\s>]/g)) {
    const end = tagEnd(text, m.index)
    out.push([text.slice(m.index, end + 1), text.slice(0, m.index).split('\n').length])
  }
  return out
}

/** The value of a JSX attribute `name={…}` in a tag, braces balanced; null when absent. */
function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}(=|[\\s>/])`).exec(tag)
  if (!m) return null
  if (m[1] !== '=') return ''
  let depth = 0
  const from = m.index + m[0].length
  for (let i = from; i < tag.length; i++) {
    if (tag[i] === '{') depth++
    else if (tag[i] === '}' && --depth === 0) return tag.slice(from, i + 1)
    else if (depth === 0 && tag[i] === '"') return tag.slice(from, tag.indexOf('"', i + 1) + 1)
  }
  return tag.slice(from)
}

const STOP_ONLY = /^\{(stop|\(e\) => e\.stopPropagation\(\))\}$/

interface Found { file: string; line: number; id: string | null; handler: string }
function dragSources(): Found[] {
  const out: Found[] = []
  for (const path of files(src)) {
    const text = readFileSync(path, 'utf8')
    const file = relative(root, path)
    for (const [tag, line] of intrinsicTags(text)) {
      const draggable = attr(tag, 'draggable')
      const handlers = [attr(tag, 'onDragStart'), attr(tag, 'onDrag'), attr(tag, 'onPointerDown')].filter((h): h is string => h !== null && !STOP_ONLY.test(h))
      const drags = (draggable !== null && draggable !== '={false}' && draggable !== '{false}') || handlers.length > 0
      if (!drags) continue
      const id = /\sdata-drag-id="([a-z0-9-]+)"/.exec(tag)?.[1] ?? null
      const handler = handlers.join(' ') || `draggable${draggable ?? ''}`
      if (!id && map.notDrags.some((n) => n.file === file && handler.includes(n.contains))) continue
      out.push({ file, line, id, handler })
    }
  }
  return out
}

describe('single-pointer alternatives to dragging (accessibility-aa D3)', () => {
  const found = dragSources()
  const ids = new Map(map.sources.map((s) => [s.id, s]))

  it('finds the drag sources it knows about', () => {
    expect(found.length).toBeGreaterThan(10)
  })

  it('every drag, resize or swipe source carries a data-drag-id', () => {
    const missing = found.filter((f) => !f.id).map((f) => `${f.file}:${f.line} ${f.handler.slice(0, 80)}`)
    expect(missing).toEqual([])
  })

  it('every data-drag-id is in scripts/ux-audit/drag-alternatives.json', () => {
    const unknown = found.filter((f) => f.id && !ids.has(f.id)).map((f) => `${f.file}:${f.line} ${f.id}`)
    expect(unknown).toEqual([])
  })

  it('every listed source is still in the app', () => {
    const used = new Set(found.map((f) => f.id))
    expect(map.sources.filter((s) => !used.has(s.id)).map((s) => s.id)).toEqual([])
  })

  it('every alternative names a menu item or control that exists', () => {
    const problems: string[] = []
    for (const s of map.sources) {
      if (!s.alternatives.length) problems.push(`${s.id}: no alternative`)
      for (const a of s.alternatives) {
        let text = ''
        try { text = readFileSync(join(root, a.file), 'utf8') } catch { problems.push(`${s.id}: ${a.file} does not exist`); continue }
        if (a.item && !new RegExp(`id: '${a.item}'`).test(text)) problems.push(`${s.id}: no menu item '${a.item}' in ${a.file}`)
        if (a.contains && !text.includes(a.contains)) problems.push(`${s.id}: ${a.file} has no "${a.contains}"`)
        if (!a.item && !a.contains) problems.push(`${s.id}: an alternative names an item or a control`)
      }
    }
    expect(problems).toEqual([])
  })

  it('every pointer handler listed as no drag is still there', () => {
    const stale = map.notDrags.filter((n) => {
      try { return !readFileSync(join(root, n.file), 'utf8').includes(n.contains) } catch { return true }
    })
    expect(stale.map((n) => `${n.file}: ${n.contains}`)).toEqual([])
  })
})
