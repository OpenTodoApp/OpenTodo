import { describe, expect, it } from 'vitest'
import { TextSelection, type EditorState, type Transaction } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import * as Y from 'yjs'
import { activeBody, DEFAULT_BODY, encodeDoc, insertModel, MAX_DOC_CHARS, newDoc, renderMarkdown, toModel, type RNode, type Run } from './richtext'
import { applyBody, createState, formattingAt, linkCommand, markdownSlice, modelToPm, pmToModel, schema, toggleCheck, wrapInBulletList, wrapInCheckList, writeBody, type EditorHooks } from './richtextEditor'

const p = (text: string): RNode => ({ type: 'paragraph', attrs: {}, runs: [{ text, marks: {} }] })
const hooks = (size = () => 0): EditorHooks => ({ askLink: () => null, onEscape: () => {}, size })

/** Position just after the first occurrence of `text` in the document. */
function after(state: EditorState, text: string): number {
  let at = -1
  state.doc.descendants((n, pos) => {
    if (at < 0 && n.isText && n.text?.includes(text)) at = pos + (n.text.indexOf(text) + text.length)
  })
  return at
}

describe('notes editor core', () => {
  it('converts between editor documents and the model without loss', () => {
    const md: RNode[] = [
      { type: 'heading', attrs: { level: 2 }, runs: [{ text: 'Plan', marks: {} }] },
      { type: 'paragraph', attrs: {}, runs: [{ text: 'a ', marks: {} }, { text: 'link', marks: { link: { href: 'https://x.y' }, strong: {} } }, { text: '\nnext line', marks: {} }] },
      { type: 'bullet_list', attrs: {}, content: [{ type: 'list_item', attrs: { checked: true }, content: [p('done')] }] },
      { type: 'ordered_list', attrs: { order: 4 }, content: [{ type: 'list_item', attrs: { checked: null }, content: [p('four')] }] },
    ]
    const doc = modelToPm(md)
    expect(modelToPm(pmToModel(doc)).eq(doc)).toBe(true)
    expect(renderMarkdown(pmToModel(doc))).toBe('## Plan\n\na [**link**](https://x.y)\nnext line\n\n- [x] done\n\n4. four')
    expect(modelToPm([]).childCount).toBe(1)
  })

  it('editor state refuses input at cap', () => {
    let size = MAX_DOC_CHARS - 10
    let state = createState([p('almost full')], hooks(() => size))
    const typed = state.apply(state.tr.insertText('more text', 1))
    expect(typed).toBe(state) // refused
    const trimmed = state.apply(state.tr.delete(1, 5))
    expect(trimmed.doc.textContent).toBe('st full') // deleting always works
    size = 1000
    state = state.apply(state.tr.insertText('ok ', 1))
    expect(state.doc.textContent).toBe('ok almost full')
  })

  it('a remote insertion above the caret keeps the caret and the local typing', () => {
    // Device A's editor and its Yjs body.
    const ydoc = newDoc(1)
    const body = ydoc.getXmlFragment(DEFAULT_BODY)
    ydoc.transact(() => insertModel(body, 0, [p('first paragraph'), p('typing here')]))
    let state = createState(toModel(body), hooks())
    // A types (not yet saved) with the caret after "typing".
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, after(state, 'typing'))))
    state = state.apply(state.tr.insertText(' still'))
    ydoc.transact(() => writeBody(body, state.doc))
    const caretBefore = state.selection.from
    // Device B inserts a paragraph above; A merges B's document.
    const b = newDoc(2)
    Y.applyUpdate(b, Y.encodeStateAsUpdate(ydoc))
    b.transact(() => insertModel(activeBody(b), 0, [p('inserted by B')]))
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(b))
    const tr = applyBody(state, body)
    expect(tr).not.toBeNull()
    state = state.apply(tr!)
    expect(state.doc.textContent).toBe('inserted by Bfirst paragraphtyping still here')
    // The caret is still after "typing still", shifted by B's paragraph.
    expect(state.selection.from).toBe(after(state, 'typing still'))
    expect(state.selection.from).toBeGreaterThan(caretBefore)
    // Applying the same body again changes nothing (no flashing).
    expect(applyBody(state, body)).toBeNull()
  })

  it('local edits write only the changed text and keep unknown marks', () => {
    const ydoc = newDoc(3)
    const body = ydoc.getXmlFragment(DEFAULT_BODY)
    ydoc.transact(() => {
      const para = new Y.XmlElement('paragraph')
      body.insert(0, [para])
      const t = new Y.XmlText()
      para.insert(0, [t])
      t.insert(0, 'highlighted', { highlight: { color: 'red' } })
      t.insert(11, ' plain', {})
    })
    let state = createState(toModel(body), hooks())
    state = state.apply(state.tr.insertText('!', state.doc.content.size - 1))
    ydoc.transact(() => writeBody(body, state.doc))
    expect(body.toString()).toContain('highlight')
    expect(renderMarkdown(toModel(body))).toBe('highlighted plain!')
    expect(encodeDoc(ydoc).length).toBeGreaterThan(0)
  })

  it('check-list commands', () => {
    let state = createState([p('buy milk')], hooks())
    wrapInCheckList(state, (tr) => (state = state.apply(tr)))
    expect(renderMarkdown(pmToModel(state.doc))).toBe('- [ ] buy milk')
    toggleCheck(state, (tr) => (state = state.apply(tr)))
    expect(renderMarkdown(pmToModel(state.doc))).toBe('- [x] buy milk')
  })

  it('Bullet list turns a check list back into a bullet list (GitHub issue 1477)', () => {
    let state = createState([p('buy milk'), p('bread')], hooks())
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, state.doc.content.size - 1)))
    wrapInCheckList(state, (tr) => (state = state.apply(tr)))
    toggleCheck(state, (tr) => (state = state.apply(tr)))
    expect(renderMarkdown(pmToModel(state.doc))).toBe('- [x] buy milk\n- [ ] bread')
    // From the caret in one item: the whole list loses its checkboxes, the text stays.
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 4)))
    expect(wrapInBulletList(state, (tr) => (state = state.apply(tr)))).toBe(true)
    expect(renderMarkdown(pmToModel(state.doc))).toBe('- buy milk\n- bread')
    // Outside a list it wraps the line as before.
    let plain = createState([p('eggs')], hooks())
    wrapInBulletList(plain, (tr) => (plain = plain.apply(tr)))
    expect(renderMarkdown(pmToModel(plain.doc))).toBe('- eggs')
  })

  it('reads which formatting applies at the selection (formatting-row-pressed)', () => {
    const run = (text: string, marks: Run['marks']): Run => ({ text, marks })
    let state = createState([{ type: 'paragraph', attrs: {}, runs: [run('plain ', {}), run('bold', { strong: {} }), run(' both', { strong: {}, em: {} })] }], hooks())
    const at = (from: number, to = from) => (state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to))), [...formattingAt(state)].sort())
    expect(at(3)).toEqual([])
    expect(at(after(state, 'bo'))).toEqual(['bold'])
    expect(at(after(state, 'bold') + 2, after(state, 'both'))).toEqual(['bold', 'italic'])
    // Plain and bold text together: not bold.
    expect(at(2, after(state, 'bold'))).toEqual([])
    // A mark stored at the caret (Bold with nothing selected) shows before typing.
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)).addStoredMark(schema.marks.strong.create()))
    expect([...formattingAt(state)]).toEqual(['bold'])
    let list = createState([p('buy milk')], hooks())
    wrapInBulletList(list, (tr) => (list = list.apply(tr)))
    expect([...formattingAt(list)]).toEqual(['bullet'])
    wrapInCheckList(list, (tr) => (list = list.apply(tr)))
    expect([...formattingAt(list)]).toEqual(['checklist'])
  })

  describe('keyboard and input rules (headless view)', () => {
    // A minimal stand-in for EditorView: what keymap and inputRules handlers use.
    function fakeView(state: EditorState) {
      const v = {
        state, composing: false,
        dispatch: (tr: import('prosemirror-state').Transaction) => (v.state = v.state.apply(tr)),
        someProp: () => undefined,
      }
      return v
    }
    const press = (v: ReturnType<typeof fakeView>, key: string, mods: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; metaKey?: boolean } = {}) => {
      const ev = { key, keyCode: 0, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods } as unknown as KeyboardEvent
      return v.state.plugins.some((pl) => pl.props.handleKeyDown?.call(pl, v as never, ev))
    }
    const typeText = (v: ReturnType<typeof fakeView>, text: string) => {
      for (const ch of text) {
        const { from, to } = v.state.selection
        const handled = v.state.plugins.some((pl) => (pl.props.handleTextInput as ((...a: unknown[]) => boolean) | undefined)?.call(pl, v, from, to, ch, () => v.state.tr.insertText(ch, from, to)))
        if (!handled) v.dispatch(v.state.tr.insertText(ch, from, to))
      }
    }
    const md = (v: ReturnType<typeof fakeView>) => renderMarkdown(pmToModel(v.state.doc))

    it('the bold shortcut bolds the selection', () => {
      const v = fakeView(createState([p('make this bold')], hooks()))
      v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, 11, 15)))
      expect(press(v, 'b', { ctrlKey: true }) || press(v, 'b', { metaKey: true })).toBe(true)
      expect(md(v)).toBe('make this **bold**')
    })

    it('"- " starts a bullet, "1. " a numbered list, "# " a heading, "[ ] " a check item', () => {
      let v = fakeView(createState([p('')], hooks()))
      typeText(v, '- item')
      expect(md(v)).toBe('- item')
      v = fakeView(createState([p('')], hooks()))
      typeText(v, '1. first')
      expect(md(v)).toBe('1. first')
      v = fakeView(createState([p('')], hooks()))
      typeText(v, '## Title')
      expect(md(v)).toBe('## Title')
      v = fakeView(createState([p('')], hooks()))
      typeText(v, '- [ ] task')
      expect(md(v)).toBe('- [ ] task')
    })

    it('inline Markdown typed becomes marks', () => {
      const v = fakeView(createState([p('')], hooks()))
      typeText(v, 'a **bold** and `code` and ~~gone~~ and *em*')
      expect(md(v)).toBe('a **bold** and `code` and ~~gone~~ and _em_')
    })
  })

  it('pasted Markdown keeps its structure', () => {
    const slice = markdownSlice('# Title\n\n- **a**\n- b')
    expect(slice.content.firstChild?.type).toBe(schema.nodes.heading)
    expect(slice.content.childCount).toBe(2)
  })
})

describe('link command (ui-correctness)', () => {
  it('applies an answer that arrives later to the selection the editor holds then', async () => {
    let state = createState([p('Read the guide')], hooks())
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, after(state, 'Read the '), after(state, 'guide'))))
    // The editor view, as far as the command uses it.
    const view = { get state() { return state }, dispatch: (tr: Transaction) => { state = state.apply(tr) }, isDestroyed: false, focus: () => {} }
    let answer: (href: string | null) => void = () => {}
    const command = linkCommand((current) => { expect(current).toBe(''); return new Promise((r) => { answer = r }) })
    expect(command(state, view.dispatch, view as unknown as EditorView)).toBe(true)
    // A remote merge inserts text before the selection while the dialog is open.
    view.dispatch(state.tr.insertText('Please ', 1))
    answer('https://example.com')
    await new Promise((r) => setTimeout(r, 0))
    const linked: string[] = []
    state.doc.descendants((n) => { if (n.isText && n.marks.some((m) => m.type.name === 'link')) linked.push(n.text ?? '') })
    expect(linked).toEqual(['guide'])
  })
})
