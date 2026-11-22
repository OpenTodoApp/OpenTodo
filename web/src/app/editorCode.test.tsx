// @vitest-environment happy-dom
// Copying a code block from the notes editor (OpenSpec change editor-copy-code-block):
// a code_block in the editor carries the same Copy button rendered Markdown does, it
// copies the same text, it never moves the caret, and it writes nothing.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { schema } from '../lib/richtextEditor'
import { click, render, waitFor } from '../ui/test-utils'
import { CodeBlock } from './CodeBlock'
import { codeViews } from './editorCode'

const realClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
function stubClipboard(writeText: (t: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
}
afterEach(() => {
  if (realClipboard) Object.defineProperty(navigator, 'clipboard', realClipboard)
})

/** A real editor holding one paragraph and one code block, with the code node view. */
async function editorWithCode(code: string, lang = 'bash') {
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('Before.')]),
    schema.node('code_block', { lang }, [schema.text(code)]),
  ])
  const host = document.createElement('div')
  document.body.append(host)
  // The node view mounts its React root as the editor draws, so building it is a commit.
  let view!: EditorView
  await act(async () => {
    view = new EditorView(host, { state: EditorState.create({ doc }), nodeViews: codeViews })
  })
  return { view, host }
}

/** The Copy button, once the node view has drawn it. */
async function copyButton(host: HTMLElement) {
  await waitFor(() => !!host.querySelector('[data-code-copy]'), 'the Copy button')
  return host.querySelector('[data-code-copy]') as HTMLElement
}

/** Unmount the editor and its node views after the current commit (React may be rendering). */
async function close(view: EditorView, host: HTMLElement) {
  view.destroy()
  // The node views unmount their roots in a later task, so wait for the page to settle.
  await waitFor(() => !host.querySelector('[data-code-copy]') || true, 'the editor to close')
  host.remove()
}

describe('a code block in the notes editor', () => {
  it('shows the Copy button and copies the block text without a trailing newline', async () => {
    const writeText = vi.fn(async () => {})
    stubClipboard(writeText)
    const { view, host } = await editorWithCode('docker compose up -d\n')
    const button = await copyButton(host)
    await click(button)
    await waitFor(() => writeText.mock.calls.length === 1, 'the copy')
    expect(writeText).toHaveBeenCalledWith('docker compose up -d')
    await waitFor(() => button.getAttribute('aria-label') === 'Copied', 'the confirmation')
    await close(view, host)
  })

  it('keeps the indentation of the block', async () => {
    const writeText = vi.fn(async () => {})
    stubClipboard(writeText)
    const { view, host } = await editorWithCode('def go():\n    return 1\n', 'python')
    await click(await copyButton(host))
    await waitFor(() => writeText.mock.calls.length === 1, 'the copy')
    expect(writeText).toHaveBeenCalledWith('def go():\n    return 1')
    await close(view, host)
  })

  it('leaves the caret where it was and writes nothing', async () => {
    stubClipboard(vi.fn(async () => {}))
    const { view, host } = await editorWithCode('make dev')
    const button = await copyButton(host)
    // The caret in the paragraph above the block, as when a person is writing.
    await act(async () => {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)))
    })
    const before = view.state.doc
    await click(button)
    expect(view.state.selection.from).toBe(2)
    expect(view.state.doc.eq(before)).toBe(true)
    await close(view, host)
  })

  it('says so when the clipboard is refused, and the text stays', async () => {
    stubClipboard(async () => {
      throw new Error('denied')
    })
    const { view, host } = await editorWithCode('make dev')
    const button = await copyButton(host)
    await click(button)
    await waitFor(() => button.getAttribute('aria-label') === 'Could not copy', 'the refusal')
    expect(host.querySelector('pre code')!.textContent).toBe('make dev')
    await close(view, host)
  })

  it('draws the block the same way rendered Markdown does', async () => {
    const { view, host } = await editorWithCode('make dev')
    await waitFor(() => !!host.querySelector('.md-code [data-code-copy]'), 'the block')
    // The node view keeps the schema's pre > code shape, so the document round-trips.
    expect(host.querySelector('.md-code > pre > code')!.textContent).toBe('make dev')
    expect(host.querySelector('.md-code')!.getAttribute('data-lang')).toBe('bash')
    await close(view, host)
  })

  // The regression this pins: a node view that is not contenteditable and has no
  // content DOM draws a block nobody can type into. The tests above drive the
  // document API, so they pass either way; this one reads the DOM a person uses.
  it('leaves the code editable and only the bar out of the editor', async () => {
    const { view, host } = await editorWithCode('make dev')
    await waitFor(() => !!host.querySelector('.md-code > pre > code'), 'the block')
    const code = host.querySelector('.md-code > pre > code') as HTMLElement
    const bar = host.querySelector('.md-code__bar') as HTMLElement
    // Nothing along the path from the editor to the code turns editing off.
    for (let el: HTMLElement | null = code; el && el !== host; el = el.parentElement) {
      expect(el.getAttribute('contenteditable'), `${el.tagName.toLowerCase()} is editable`).not.toBe('false')
    }
    // The bar is the node view's own part, and never takes the caret (design D3).
    expect(bar.getAttribute('contenteditable')).toBe('false')
    await close(view, host)
  })

  it('copies the same text in the editor and in rendered Markdown', async () => {
    const writeText = vi.fn(async () => {})
    stubClipboard(writeText)
    const src = 'def go():\n    return 1\n'
    const { view, host } = await editorWithCode(src, 'python')
    await click(await copyButton(host))
    await waitFor(() => writeText.mock.calls.length === 1, 'the editor copy')
    await close(view, host)
    // The renderer's block over the same text, through the shared control.
    const { container, unmount } = await render(<CodeBlock text={src} />)
    await click(container.querySelector('[data-code-copy]')!)
    await waitFor(() => writeText.mock.calls.length === 2, 'the rendered copy')
    expect(writeText.mock.calls[0]).toEqual(writeText.mock.calls[1])
    await unmount()
  })
})
