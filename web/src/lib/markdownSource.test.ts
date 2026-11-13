// The Markdown source mode's block application (OpenSpec change note-markdown-source,
// tasks 1.1 and 1.2): only changed blocks are replaced, untouched mentions, images and
// tables keep their nodes, caret mapping across a remote edit, a two-document merge and
// a benchmark at the document size limit.
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { activeBody, newDoc, renderMarkdown, toModel, updateBody, type RNode, type Run } from './richtext'
import { createState, modelToPm, pmToModel, writeBody, type EditorHooks } from './richtextEditor'
import { alignBlocks, applySource, blockAt, mapCaret, sourceOf } from './markdownSource'

const hooks: EditorHooks = { askLink: () => null, onEscape: () => {}, size: () => 0 }
const run = (text: string, marks: Run['marks'] = {}): Run => ({ text, marks })
const p = (...runs: Run[]): RNode => ({ type: 'paragraph', attrs: {}, runs })
const md = (nodes: RNode[]) => renderMarkdown(nodes)
const stateOf = (nodes: RNode[]) => createState(nodes, hooks)
const applied = (nodes: RNode[], text: string) => {
  const s = stateOf(nodes)
  const tr = applySource(s, text)
  return { before: s, after: tr ? s.apply(tr) : s, tr }
}

describe('Markdown source', () => {
  it('shows the blocks a blank line apart and reads the same text back without a change', () => {
    const nodes = [{ type: 'heading', attrs: { level: 1 }, runs: [run('Plan')] } as RNode,
      { type: 'bullet_list', attrs: {}, content: [{ type: 'list_item', attrs: { checked: false }, content: [p(run('milk'))] }] } as RNode]
    const s = stateOf(nodes)
    expect(sourceOf(s.doc)).toBe('# Plan\n\n- [ ] milk')
    expect(applySource(s, sourceOf(s.doc))).toBeNull()
  })

  it('replaces only the changed block: an untouched mention, image and table keep their nodes', () => {
    const mention = p(run('Ask '), run('@Anna', { mention: { id: 'u-anna', name: 'Anna' } } as Run['marks']), run(' about it'))
    const image: RNode = { type: 'image', attrs: { id: 'att-1', alt: 'Kitchen' } }
    const table: RNode = { type: 'table', attrs: {}, content: [
      { type: 'table_row', attrs: {}, content: [{ type: 'table_header', attrs: { align: null }, runs: [run('Item')] }] },
      { type: 'table_row', attrs: {}, content: [{ type: 'table_cell', attrs: { align: null }, runs: [run('Paint')] }] },
    ] }
    const nodes = [mention, p(run('second')), image, table]
    const { before, after } = applied(nodes, sourceOf(stateOf(nodes).doc).replace('second', 'second, edited'))
    const model = pmToModel(after.doc)
    expect(model[1].runs![0].text).toBe('second, edited')
    expect(after.doc.child(0)).toBe(before.doc.child(0))
    expect(model[0].runs![1].marks.mention).toEqual({ id: 'u-anna', name: 'Anna' })
    expect(after.doc.child(2)).toBe(before.doc.child(2))
    expect(after.doc.child(3)).toBe(before.doc.child(3))
  })

  it('inserts and deletes blocks, and fixes a list: `1. milk` becomes `- milk`', () => {
    const nodes = [p(run('one')), { type: 'ordered_list', attrs: { order: 1 }, content: [{ type: 'list_item', attrs: { checked: null }, content: [p(run('milk'))] }] } as RNode, p(run('three'))]
    const { after } = applied(nodes, 'zero\n\none\n\n- milk')
    expect(md(pmToModel(after.doc))).toBe('zero\n\none\n\n- milk')
    expect(after.doc.child(2).type.name).toBe('bullet_list')
    expect(md(pmToModel(applied(nodes, '').after.doc))).toBe('')
    expect(md(pmToModel(applied([p()], 'new text').after.doc))).toBe('new text')
  })

  it('aligns blocks by a longest common subsequence', () => {
    expect(alignBlocks(['a', 'b', 'c', 'd'], ['a', 'x', 'c', 'd', 'e'])).toEqual([[0, 0], [2, 2], [3, 3]])
    expect(alignBlocks(['a', 'b'], ['b', 'a'])).toHaveLength(1)
    expect(alignBlocks([], ['a'])).toEqual([])
  })

  it('finds the block of an offset and keeps the caret across a remote edit (Remote edit while typing)', () => {
    const text = 'first para\n\nmiddle\n\nlast'
    expect(blockAt(text, 3)).toBe(0)
    expect(blockAt(text, text.indexOf('mid') + 2)).toBe(1)
    // The caret after "first" stays after "first" when the last paragraph changes remotely.
    expect(mapCaret(text, 'first para\n\nmiddle\n\nlast, changed elsewhere', 5)).toBe(5)
    // A block added above moves it down with its block.
    const after = 'new top\n\nfirst para\n\nmiddle\n\nlast'
    expect(mapCaret(text, after, text.indexOf('middle') + 3)).toBe(after.indexOf('middle') + 3)
  })

  it('Concurrent edit kept: A edits the second paragraph in source while B adds a fourth', () => {
    const start = [p(run('one')), p(run('two')), p(run('three'))]
    const a = newDoc()
    a.transact(() => updateBody(activeBody(a), start))
    const b = new Y.Doc()
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    // A, in source mode: the second paragraph changes.
    const sa = createState(toModel(activeBody(a)), hooks)
    const ta = applySource(sa, 'one\n\ntwo, from A\n\nthree')!
    a.transact(() => writeBody(activeBody(a), sa.apply(ta).doc))
    // B, online, adds a fourth paragraph.
    b.transact(() => updateBody(activeBody(b), [...toModel(activeBody(b)), p(run('four from B'))]))
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    const want = 'one\n\ntwo, from A\n\nthree\n\nfour from B'
    expect(md(toModel(activeBody(a)))).toBe(want)
    expect(md(toModel(activeBody(b)))).toBe(want)
  })

  it('aligns a note at the document size limit in under 50 ms', () => {
    const nodes = Array.from({ length: 3000 }, (_, i) => p(run(`Paragraph ${i} with some words to make it a realistic line of a long note.`)))
    const s = createState(nodes, hooks)
    const text = sourceOf(s.doc).replace('Paragraph 1500 ', 'Paragraph 1500 edited ')
    const t0 = performance.now()
    const tr = applySource(s, text)
    const ms = performance.now() - t0
    expect(tr).not.toBeNull()
    expect(modelToPm(pmToModel(s.apply(tr!).doc)).childCount).toBe(3000)
    // The phone profile is about 4× slower than a computer: a quarter of the 50 ms, with room for a busy runner.
    expect(ms).toBeLessThan(25)
  })
})
