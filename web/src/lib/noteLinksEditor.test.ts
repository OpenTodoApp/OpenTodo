// Links in the editor (OpenSpec change note-links, D1, D2): the stored form, the
// editor-only link node, label refresh on edits only, and what a 1.0 client reads.
import { describe, expect, it, vi } from 'vitest'
import { TextSelection } from 'prosemirror-state'
import * as Y from 'yjs'
import { activeBody, decodeDoc, encodeDoc, newDoc, renderMarkdown, toModel, type RNode } from './richtext'
import { createState, deleteRef, modelToPm, pmToModel, schema, writeBody, type EditorHooks } from './richtextEditor'
import * as rt10 from './testdata/richtext-1.0/richtext'

const titles = new Map<string, string>()
vi.mock('./noteLinks', async (orig) => {
  const real = await orig<typeof import('./noteLinks')>()
  return { ...real, titleOf: (href: string) => titles.get(href) ?? null }
})

const hooks: EditorHooks = { askLink: () => null, onEscape: () => {}, size: () => 0 }
const link = (text: string, href: string) => ({ text, marks: { link: { href } } })
const para = (...runs: { text: string; marks: Record<string, Record<string, unknown>> }[]): RNode => ({ type: 'paragraph', attrs: {}, runs })

function refs(doc: import('prosemirror-model').Node) {
  const out: { href: string; label: string }[] = []
  doc.descendants((n) => { if (n.type === schema.nodes.ref) out.push(n.attrs as { href: string; label: string }) })
  return out
}

describe('links in the editor', () => {
  it('reads an internal link run as one link node and writes it back as link formatting', () => {
    titles.clear()
    const model = [para({ text: 'See ', marks: {} }, link('Trip', '?note=n1'), { text: ' and ', marks: {} }, link('site', 'https://x.y'))]
    const doc = modelToPm(model)
    expect(refs(doc)).toEqual([{ href: '?note=n1', label: 'Trip' }])
    expect(renderMarkdown(pmToModel(doc))).toBe('See [Trip](?note=n1) and [site](https://x.y)')
  })

  it('shows a doubled label (two concurrent refreshes) as one link', () => {
    const doc = modelToPm([para(link('Holiday', '?note=n'), { text: 'Holiday', marks: { link: { href: '?note=n' }, strong: {} } })])
    expect(refs(doc)).toEqual([{ href: '?note=n', label: 'HolidayHoliday' }])
  })

  it('a document written by this build reads in the 1.0 display model, and a 1.0 edit keeps the link', () => {
    titles.clear()
    const y = newDoc()
    const state = createState([para({ text: 'Plan ', marks: {} }, link('Trip', '?note=n1'), { text: ' and ', marks: {} }, link('Call', '?task=t1'))], hooks)
    y.transact(() => writeBody(activeBody(y), state.doc))
    const stored = encodeDoc(y)
    // 1.0: decode with the frozen v1.0.0 model.
    const old = rt10.decodeDoc(stored) as Y.Doc
    const oldModel = rt10.toModel(rt10.activeBody(old))
    expect(oldModel[0].runs).toEqual([{ text: 'Plan ', marks: {} }, link('Trip', '?note=n1'), { text: ' and ', marks: {} }, link('Call', '?task=t1')])
    expect(rt10.projectDoc(stored)).toBe('Plan [Trip](?note=n1) and [Call](?task=t1)')
    // A 1.0 device adds a paragraph and syncs.
    old.transact(() => rt10.updateBody(rt10.activeBody(old), [...oldModel, { type: 'paragraph', attrs: {}, runs: [{ text: 'More', marks: {} }] }]))
    const after10 = rt10.encodeDoc(old)
    const back = decodeDoc(after10) as Y.Doc
    expect(refs(modelToPm(toModel(activeBody(back))))).toEqual([{ href: '?note=n1', label: 'Trip' }, { href: '?task=t1', label: 'Call' }])
    expect(rt10.projectDoc(after10)).toContain('(?note=n1)')
  })

  it('an edit writes the current titles of stale links; a link it cannot read keeps its text', () => {
    titles.clear()
    const y = newDoc()
    const model = [para({ text: 'Call: ', marks: {} }, link('Call plumber', '?task=t1')), para(link('Gone', '?note=x'))]
    y.transact(() => writeBody(activeBody(y), modelToPm(model)))
    const before = encodeDoc(y)
    // Opening is not a write: the state holds the stored labels.
    let state = createState(toModel(activeBody(y)), hooks)
    expect(refs(state.doc).map((r) => r.label)).toEqual(['Call plumber', 'Gone'])
    titles.set('?task=t1', 'Call the plumber')
    // The user types at the end of the second paragraph.
    state = state.apply(state.tr.setSelection(TextSelection.atEnd(state.doc)).insertText('!'))
    y.transact(() => writeBody(activeBody(y), state.doc))
    expect(encodeDoc(y)).not.toBe(before)
    expect(renderMarkdown(toModel(activeBody(y)))).toBe('Call: [Call the plumber](?task=t1)\n\n[Gone](?note=x)!')
  })

  it('Backspace after a link removes it whole; Delete before it too', () => {
    let state = createState([para({ text: 'a', marks: {} }, link('Trip', '?note=n'), { text: 'b', marks: {} })], hooks)
    // Caret right after the link (a=1, link=1 position).
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)))
    deleteRef(-1)(state, (tr) => { state = state.apply(tr) })
    expect(state.doc.textContent).toBe('ab')
    state = createState([para({ text: 'a', marks: {} }, link('Trip', '?note=n'))], hooks)
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)))
    expect(deleteRef(1)(state, (tr) => { state = state.apply(tr) })).toBe(true)
    expect(refs(state.doc)).toEqual([])
  })
})
