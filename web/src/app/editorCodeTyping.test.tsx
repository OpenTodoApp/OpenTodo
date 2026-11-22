// @vitest-environment happy-dom
// A code block in the notes editor (OpenSpec change editor-copy-code-block): its
// node view still lets a person edit the block. Typing into it reaches the document
// and the screen, and the text it shows is the text the Copy button copies. A node
// view that cannot hold the caret makes the block unwritable, which is worse than
// having no Copy button at all, so the editor's own input path is exercised here.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { createState, type EditorHooks } from '../lib/richtextEditor'
import { click, waitFor } from '../ui/test-utils'
import { codeViews } from './editorCode'

const hooks: EditorHooks = { askLink: () => null, onEscape: () => {}, size: () => 0 }
const realClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

const editors: { view: EditorView; host: HTMLElement }[] = []

/** A real editor (the notes editor's own state, input rules and node views). */
async function editor(nodes: Parameters<typeof createState>[0]) {
  const host = document.createElement('div')
  document.body.append(host)
  let view!: EditorView
  await act(async () => {
    view = new EditorView(host, { state: createState(nodes, hooks), nodeViews: codeViews })
  })
  const opened = { view, host }
  editors.push(opened)
  return opened
}

afterEach(() => {
  for (const { view, host } of editors.splice(0)) {
    view.destroy()
    host.remove()
  }
  if (realClipboard) Object.defineProperty(navigator, 'clipboard', realClipboard)
})

/** Put the caret at the end of the document, as a click into the last block would. */
async function caretAtEnd(v: EditorView) {
  await act(async () => {
    const pos = v.state.doc.content.size - 1
    v.dispatch(v.state.tr.setSelection(TextSelection.near(v.state.doc.resolve(pos), -1)))
  })
}

/** Type text the way a keystroke arrives: the input rules first, then the insert. */
async function typeText(v: EditorView, text: string) {
  await act(async () => {
    const { from, to } = v.state.selection
    const handled = v.someProp('handleTextInput', (f) => f(v, from, to, text, () => v.state.tr.insertText(text, from, to)))
    if (!handled) v.dispatch(v.state.tr.insertText(text, from, to))
  })
}

/** Type each character, so the input rules see every keystroke. */
async function typeChars(v: EditorView, text: string) {
  for (const ch of text) await typeText(v, ch)
}

/** The code the block shows on screen. */
function shownCode(host: HTMLElement): string {
  return host.querySelector('.md-code > pre > code')!.textContent ?? ''
}

describe('editing a code block in the notes editor', () => {
  it('types into an existing block', async () => {
    const { view, host } = await editor([
      { type: 'paragraph', attrs: {}, runs: [{ text: 'Before.', marks: {} }] },
      { type: 'code_block', attrs: { lang: 'sh' }, runs: [{ text: 'make dev', marks: {} }] },
    ])
    await caretAtEnd(view)
    await typeText(view, ' now')
    expect(view.state.doc.textContent).toContain('make dev now')
    await waitFor(() => shownCode(host) === 'make dev now', 'the typed text on screen')
  })

  it('opens a block from the ``` input rule and types into it', async () => {
    const { view, host } = await editor([{ type: 'paragraph', attrs: {}, runs: [] }])
    await caretAtEnd(view)
    // "```sh " at the start of a line is the schema's input rule for a code block.
    await typeChars(view, '```sh ')
    await waitFor(() => view.state.doc.firstChild?.type.name === 'code_block', 'the code block')
    await caretAtEnd(view)
    await typeChars(view, 'make dev')
    expect(view.state.doc.firstChild!.type.name).toBe('code_block')
    expect(view.state.doc.textContent).toBe('make dev')
    await waitFor(() => shownCode(host) === 'make dev', 'the typed text on screen')
  })

  it('copies what was typed', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const { view, host } = await editor([{ type: 'code_block', attrs: { lang: 'sh' }, runs: [] }])
    await caretAtEnd(view)
    await typeChars(view, 'make dev')
    await waitFor(() => !!host.querySelector('[data-code-copy]'), 'the button')
    await click(host.querySelector('[data-code-copy]') as HTMLElement)
    await waitFor(() => writeText.mock.calls.length === 1, 'the copy')
    expect(writeText).toHaveBeenCalledWith('make dev')
  })
})
