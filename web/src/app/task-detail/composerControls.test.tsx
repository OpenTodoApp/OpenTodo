// @vitest-environment happy-dom
// The comment composer's Mention and Formatting controls (OpenSpec change
// rich-comments, D2, D3), and bodies posted as plain Markdown rendering as before.
import { act } from 'react'
import { TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MentionTarget } from '../../lib/comments'
import { setFormattingButton } from '../../lib/userPrefs'
import { formattingRowKey } from '../../lib/formattingRow'
import type { Comment } from '../../lib/types'
import { click, flush, key, render as mount, waitFor } from '../../ui/test-utils'
import { setRichComposer, writeDraft } from './Composer'
import { CommentsView, type CommentsViewProps } from './CommentsTab'
import { composerViewOf } from './RichComposerField'

// Every rendered tree is unmounted after its test, so no live query fires once the environment is gone.
const mounted: { unmount: () => Promise<void> }[] = []
async function render(ui: Parameters<typeof mount>[0]) {
  const r = await mount(ui)
  mounted.push(r)
  return r
}

const MON = new Date(2026, 9, 12, 15, 5).getTime()
const targets: MentionTarget[] = [
  { userId: 'me', name: 'Me', email: 'me@example.com' },
  { userId: 'anna', name: 'Anna', email: 'anna@example.com' },
  { userId: 'group:g-adults', name: 'Adults', email: '', group: { size: 2 } },
]

function props(over: Partial<CommentsViewProps> = {}): CommentsViewProps {
  return {
    taskId: 't1', threads: [], me: 'me', role: 'admin', members: targets, name: (id) => (id === 'me' ? 'You' : 'Anna'),
    onCreate: vi.fn(async () => true), onEdit: vi.fn(async () => true), onDelete: vi.fn(async () => {}), now: MON + 1000, ...over,
  }
}

async function typeText(v: EditorView, text: string) {
  for (const ch of text) {
    const { from, to } = v.state.selection
    const handled = v.someProp('handleTextInput', (f) => f(v, from, to, ch, () => v.state.tr.insertText(ch, from, to)))
    if (!handled) v.dispatch(v.state.tr.insertText(ch, from, to))
  }
  await flush()
}

async function press(v: EditorView, k: string, mods: KeyboardEventInit = {}) {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods })
  v.someProp('handleKeyDown', (f) => f(v, ev))
  await flush()
}

async function typeArea(el: HTMLTextAreaElement, text: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const mentionButton = (root: ParentNode) => root.querySelector<HTMLButtonElement>('[data-composer-mention]')
const posted = (p: CommentsViewProps) => (p.onCreate as ReturnType<typeof vi.fn>).mock.calls

beforeEach(() => {
  sessionStorage.clear()
  writeDraft('t1', '')
})
afterEach(async () => {
  for (const r of mounted.splice(0)) await r.unmount()
  await flush()
  setRichComposer(true)
})

describe('Mention control', () => {
  it('starts a mention after the text in the rich editor, then posts it', async () => {
    const p = props()
    const r = await render(<CommentsView {...p} />)
    await waitFor(() => !!r.container.querySelector('[data-rich-composer] #comment-composer'), 'the rich composer')
    const v = composerViewOf(r.container.querySelector('#comment-composer')!)!
    v.focus()
    await typeText(v, 'Thanks')
    expect(mentionButton(r.container)?.getAttribute('aria-label')).toBe('Mention someone')
    await click(mentionButton(r.container)!)
    await waitFor(() => v.state.doc.textContent.endsWith('@'), 'the @ inserted')
    expect(v.state.doc.textContent).toBe('Thanks @')
    await waitFor(() => !!document.querySelector('[data-suggest="mention"]'), 'the mention list')
    const options = [...document.querySelectorAll('[data-suggest="mention"] [role="option"]')].map((o) => o.textContent)
    expect(options[0]).toContain('Anna')
    expect(options.at(-1)).toContain('Adults')
    await press(v, 'Enter')
    await press(v, 'Enter', { ctrlKey: true })
    await waitFor(() => posted(p).length > 0, 'the comment to post')
    expect(posted(p)[0].slice(0, 2)).toEqual(['Thanks @Anna', ['anna']])
  })

  it('works in the plain field too', async () => {
    const p = props({ richComposer: false })
    const r = await render(<CommentsView {...p} />)
    const area = r.container.querySelector('#comment-composer') as HTMLTextAreaElement
    await typeArea(area, 'Hi')
    area.setSelectionRange(2, 2)
    await click(mentionButton(r.container)!)
    await waitFor(() => area.value.endsWith('@'), 'the @ inserted')
    expect(area.value).toBe('Hi @')
    await waitFor(() => document.querySelectorAll('[role="listbox"] [role="option"]').length > 0, 'the mention list')
    await key(area, 'Enter')
    expect(area.value).toBe('Hi @Anna ')
    // The pick places the caret after the name on the next frame.
    await waitFor(() => area.selectionStart === 'Hi @Anna '.length, 'the caret after the name')
    await key(area, 'Enter', { ctrlKey: true })
    await waitFor(() => posted(p).length > 0, 'the comment to post')
    expect(posted(p)[0].slice(0, 2)).toEqual(['Hi @Anna ', ['anna']])
  })

  it('is not offered without anyone to mention (a personal task)', async () => {
    const r = await render(<CommentsView {...props({ members: [], richComposer: false })} />)
    expect(mentionButton(r.container)).toBeNull()
  })
})

describe('Formatting control', () => {
  it('shows the formatting row on a computer, applies bold, and hides it again', async () => {
    const p = props()
    const r = await render(<CommentsView {...p} />)
    await waitFor(() => !!r.container.querySelector('[data-rich-composer] #comment-composer'), 'the rich composer')
    const v = composerViewOf(r.container.querySelector('#comment-composer')!)!
    const toggle = r.container.querySelector<HTMLButtonElement>('[data-composer-formatting]')!
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(r.container.querySelector('[data-editor-toolbar]')).toBeNull()
    await click(toggle)
    await waitFor(() => !!r.container.querySelector('[data-editor-toolbar]'), 'the formatting row')
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    v.focus()
    await typeText(v, 'done')
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, 1, 5)))
    await click(r.container.querySelector<HTMLButtonElement>('[data-editor-toolbar] [aria-label="Bold"]')!)
    await press(v, 'Enter', { ctrlKey: true })
    await waitFor(() => posted(p).length > 0, 'the comment to post')
    expect(posted(p)[0][0]).toBe('**done**')
    await click(toggle)
    await waitFor(() => !r.container.querySelector('[data-editor-toolbar]'), 'the row to hide')
  })

  it('Formatting row remembered: another composer opens with the row, notes are unaffected (notes-toolbar-desktop D6)', async () => {
    const first = await render(<CommentsView {...props()} />)
    await waitFor(() => !!first.container.querySelector('[data-rich-composer] #comment-composer'), 'the rich composer')
    await click(first.container.querySelector<HTMLButtonElement>('[data-composer-formatting]')!)
    await waitFor(() => !!first.container.querySelector('[data-editor-toolbar]'), 'the formatting row')
    expect(localStorage.getItem(formattingRowKey('comments'))).toBe('on')
    expect(localStorage.getItem(formattingRowKey('notes'))).toBeNull()
    await first.unmount()
    const second = await render(<CommentsView {...props({ taskId: 't2' })} />)
    await waitFor(() => !!second.container.querySelector('[data-editor-toolbar]'), 'the remembered row')
    expect(second.container.querySelector('[data-composer-formatting]')!.getAttribute('aria-pressed')).toBe('true')
  })

  it('Formatting button turned off: no toggle and no row; the bold shortcut still works', async () => {
    localStorage.setItem(formattingRowKey('comments'), 'on')
    await setFormattingButton(false)
    const p = props()
    const r = await render(<CommentsView {...p} />)
    await waitFor(() => !!r.container.querySelector('[data-rich-composer] #comment-composer'), 'the rich composer')
    await waitFor(() => !r.container.querySelector('[data-composer-formatting]'), 'the toggle hidden')
    expect(r.container.querySelector('[data-editor-toolbar]')).toBeNull()
    const v = composerViewOf(r.container.querySelector('#comment-composer')!)!
    v.focus()
    await typeText(v, 'done')
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, 1, 5)))
    await press(v, 'b', { ctrlKey: true })
    await press(v, 'Enter', { ctrlKey: true })
    await waitFor(() => posted(p).length > 0, 'the comment to post')
    expect(posted(p)[0][0]).toBe('**done**')
  })
})

describe('rendering', () => {
  it('a body written through the API renders bold and a mention chip, as before', async () => {
    const c = { id: 'c1', task_id: 't1', parent_id: null, body: '**done**, see @Anna', author_id: 'anna', mentions: ['anna'], created_at: MON, edited_at: null, deleted_at: null, _clock: {} } as Comment
    const r = await render(<CommentsView {...props({ threads: [{ root: c, replies: [] }], richComposer: false })} />)
    const body = r.container.querySelector('.markdown')!
    expect(body.querySelector('strong')?.textContent).toBe('done')
    expect(body.querySelector('[data-mention-token="Anna"]')).not.toBeNull()
  })
})
