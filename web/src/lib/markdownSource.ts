// A note's Markdown source (OpenSpec change note-markdown-source): the note's top-level
// blocks as Markdown (D1), and source text applied back block by block (D2): only the
// blocks whose Markdown differs are replaced, inserted or deleted, so untouched blocks
// keep their nodes (mentions, attachment images, tables) and the edit merges like any
// other document edit. Pure functions over ProseMirror states.
import type { Node as PMNode } from 'prosemirror-model'
import type { EditorState, Transaction } from 'prosemirror-state'
import { parseMarkdown, renderMarkdown, type ParseOptions, type RNode } from './richtext'
import { modelToPm, pmToModel, schema } from './richtextEditor'

/** One top-level block of the document: its Markdown and where its node is. */
export interface SourceBlock { text: string; from: number; to: number }

/** A block's Markdown, kept per node: a node no edit touched is the same object in the next state. */
const blockText = new WeakMap<PMNode, string>()
function textOf(node: PMNode): string {
  let text = blockText.get(node)
  if (text === undefined) {
    text = renderMarkdown(pmToModel(node.type.schema.topNodeType.create(null, node)))
    blockText.set(node, text)
  }
  return text
}

/** The document's top-level blocks with their Markdown; empty blocks are left out, as in the projection. */
export function docBlocks(doc: PMNode): SourceBlock[] {
  const out: SourceBlock[] = []
  doc.forEach((node, offset) => {
    const text = textOf(node)
    if (text) out.push({ text, from: offset, to: offset + node.nodeSize })
  })
  return out
}

/** The source text shown for a document: its blocks, a blank line apart. */
export function sourceOf(doc: PMNode): string {
  return docBlocks(doc).map((b) => b.text).join('\n\n')
}

/**
 * The pairs [i, j] of equal entries of `a` and `b` in a longest common subsequence,
 * in order. Common ends are matched first, so an edit of a few blocks in a long
 * note aligns in linear time; the middle is quadratic at worst (D2, Risks).
 */
export function alignBlocks(a: readonly string[], b: readonly string[]): [number, number][] {
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++
  const pairs: [number, number][] = []
  for (let k = 0; k < head; k++) pairs.push([k, k])
  const n = a.length - head - tail
  const m = b.length - head - tail
  if (n > 0 && m > 0) {
    // Lengths of the LCS of a[head+i..] and b[head+j..], one row per i.
    const len: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        len[i][j] = a[head + i] === b[head + j] ? len[i + 1][j + 1] + 1 : Math.max(len[i + 1][j], len[i][j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < n && j < m) {
      if (a[head + i] === b[head + j]) { pairs.push([head + i, head + j]); i++; j++ }
      else if (len[i + 1][j] >= len[i][j + 1]) i++
      else j++
    }
  }
  for (let k = tail; k > 0; k--) pairs.push([a.length - k, b.length - k])
  return pairs
}

/**
 * The transaction that makes the document read as `text` (D2), or null when it
 * already does: each run of blocks between matched ones is replaced by the parsed
 * blocks of the text, and matched blocks are left as they are.
 */
export function applySource(state: EditorState, text: string, opts: ParseOptions = {}): Transaction | null {
  const all = docBlocks(state.doc)
  // The text's blocks that read exactly as the document's at either end are not parsed
  // again: a pause after typing in one block parses that block only.
  const raw = splitBlocks(text)
  let head = 0
  while (head < raw.length && head < all.length && raw[head].text === all[head].text) head++
  let tail = 0
  while (tail < raw.length - head && tail < all.length - head && raw[raw.length - 1 - tail].text === all[all.length - 1 - tail].text) tail++
  if (head === raw.length && head === all.length) return null
  const middle = raw.slice(head, raw.length - tail)
  const middleText = middle.length ? text.slice(middle[0].start, middle[middle.length - 1].start + middle[middle.length - 1].text.length) : ''
  const old = all.slice(head, all.length - tail)
  const fresh = parseMarkdown(middleText, opts).map((node) => ({ node, text: renderMarkdown([node]) })).filter((b) => b.text)
  const pairs = alignBlocks(old.map((b) => b.text), fresh.map((b) => b.text))
  if (pairs.length === old.length && pairs.length === fresh.length) return null
  const tr = state.tr
  if (old.length === 0 && fresh.length > 0) {
    // Only an insertion between kept blocks (or into an empty note).
    const at = head > 0 ? all[head - 1].to : all.length ? all[head].from : 0
    const content = modelToPm(fresh.map((b) => b.node)).content
    return all.length ? tr.insert(at, content) : tr.replaceWith(0, state.doc.content.size, content)
  }
  if (all.length === old.length && fresh.length === 0) return tr.replaceWith(0, state.doc.content.size, schema.nodes.paragraph.create())
  // The runs between matches, applied from the end so earlier positions hold.
  const runs: { i0: number; i1: number; j0: number; j1: number }[] = []
  let pi = 0
  let pj = 0
  for (const [i, j] of [...pairs, [old.length, fresh.length] as [number, number]]) {
    if (i > pi || j > pj) runs.push({ i0: pi, i1: i, j0: pj, j1: j })
    pi = i + 1
    pj = j + 1
  }
  for (const r of runs.reverse()) {
    const nodes: RNode[] = fresh.slice(r.j0, r.j1).map((b) => b.node)
    const content = nodes.length ? modelToPm(nodes).content : null
    if (r.i1 > r.i0) {
      const from = old[r.i0].from
      const to = old[r.i1 - 1].to
      if (content) tr.replaceWith(from, to, content)
      else tr.delete(from, to)
    } else if (content) {
      tr.insert(r.i0 > 0 ? old[r.i0 - 1].to : old[0].from, content)
    }
  }
  return tr
}

/** The index of the block that holds offset `at` of a source text (a prefix parses to as many blocks). */
export function blockAt(text: string, at: number): number {
  return Math.max(0, parseMarkdown(text.slice(0, at)).filter((n) => renderMarkdown([n])).length - 1)
}

/**
 * Where a caret at `at` in `before` lands in `after`, two source texts of the same
 * note a remote edit apart (D3): in the same block, found by alignment, at the same
 * offset from the block's start.
 */
export function mapCaret(before: string, after: string, at: number): number {
  const a = splitBlocks(before)
  const b = splitBlocks(after)
  const k = Math.min(a.length - 1, blockIndexByOffset(a, at))
  if (k < 0) return Math.min(at, after.length)
  const offset = at - a[k].start
  const pairs = alignBlocks(a.map((x) => x.text), b.map((x) => x.text))
  const hit = pairs.find(([i]) => i === k)
  // An unmatched block (the remote edit changed it too): the same place in order.
  const [pi, pj] = pairs.filter(([i]) => i < k).pop() ?? [-1, -1]
  const k2 = hit ? hit[1] : Math.min(b.length - 1, pj + (k - pi))
  if (k2 < 0) return 0
  return b[k2].start + Math.min(offset, b[k2].text.length)
}

/** Blocks of a source text split at blank lines, with their offsets (fences kept whole). */
function splitBlocks(text: string): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = []
  const re = /\n[ \t]*\n+/g
  let start = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const chunk = text.slice(start, m.index)
    // Inside an open code fence a blank line is part of the block.
    if ((chunk.match(/^ {0,3}```/gm)?.length ?? 0) % 2 === 1) continue
    out.push({ text: chunk, start })
    start = m.index + m[0].length
  }
  out.push({ text: text.slice(start), start })
  return out
}

function blockIndexByOffset(blocks: { text: string; start: number }[], at: number): number {
  let k = 0
  for (let i = 0; i < blocks.length; i++) if (blocks[i].start <= at) k = i
  return k
}
