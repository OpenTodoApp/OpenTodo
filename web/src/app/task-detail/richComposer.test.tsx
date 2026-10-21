// @vitest-environment happy-dom
// The rich comment composer and reactions (OpenSpec change editor-everywhere,
// tasks 5.1 and 5.2): the notes editor on a Markdown body, byte-identical when
// unchanged, text outside the subset kept, drafts, keyboard posting, and the
// reaction bar toggled by pointer and keyboard.
import { TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Comment, ProjectMember } from '../../lib/types'
import { click, flush, key, render, waitFor } from '../../ui/test-utils'
import { isTypingTarget } from '../shortcuts/dispatch'
import { readDraft, setRichComposer, writeDraft } from './Composer'
import { CommentsView, type CommentsViewProps } from './CommentsTab'
import { composerViewOf } from './RichComposerField'

setRichComposer(true)

const MON = new Date(2026, 9, 12, 15, 5).getTime()
const comment = (id: string, author: string, body: string, reactions: Record<string, string[]> = {}, deleted_at: number | null = null): Comment =>
  ({ id, task_id: 't1', parent_id: null, body, author_id: author, mentions: [], created_at: MON, edited_at: null, deleted_at, reactions, _clock: {} } as Comment)
const members: ProjectMember[] = [{ userId: 'me', name: 'Me', email: 'me@example.com', role: 'admin' }, { userId: 'ana', name: 'Ana', email: 'ana@example.com', role: 'editor' }]

function props(over: Partial<CommentsViewProps> = {}): CommentsViewProps {
  return {
    taskId: 't1', threads: [], me: 'me', role: 'admin', members, name: (id) => (id === 'me' ? 'You' : 'Ana'),
    onCreate: vi.fn(async () => true), onEdit: vi.fn(async () => true), onDelete: vi.fn(async () => {}), onReact: vi.fn(), now: MON + 1000, ...over,
  }
}

async function richView(root: ParentNode, id = 'comment-composer'): Promise<EditorView> {
  await waitFor(() => !!root.querySelector(`[data-rich-composer] #${id}`), 'the rich composer')
  return composerViewOf(root.querySelector(`#${id}`)!)!
}

async function typeText(v: EditorView, text: string) {
  for (const ch of text) {
    const { from, to } = v.state.selection
    const handled = v.someProp('handleTextInput', (f) => f(v, from, to, ch, () => v.state.tr.insertText(ch, from, to)))
    if (!handled) v.dispatch(v.state.tr.insertText(ch, from, to))
  }
  await flush(10)
}

async function press(v: EditorView, k: string, mods: KeyboardEventInit = {}) {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods })
  const done = v.someProp('handleKeyDown', (f) => f(v, ev))
  await flush(20)
  return done
}

beforeEach(() => {
  sessionStorage.clear()
  writeDraft('t1', '')
})
afterEach(() => vi.unstubAllGlobals())

describe('rich composer', () => {
  it('Formatting from the keyboard: a bullet with a bold word, posted with Ctrl+Enter', async () => {
    const p = props()
    const r = await render(<CommentsView {...p} />)
    const v = await richView(r.container)
    await typeText(v, '- buy milk')
    const end = v.state.selection.from
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, end - 4, end)))
    expect(await press(v, 'b', { ctrlKey: true })).toBe(true)
    expect(await press(v, 'Enter', { ctrlKey: true })).toBe(true)
    await waitFor(() => (p.onCreate as ReturnType<typeof vi.fn>).mock.calls.length > 0)
    expect((p.onCreate as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('- buy **milk**')
    await r.unmount()
  })

  it('Unchanged edit is byte-identical: nothing is written', async () => {
    const body = 'Use *stars* and __double__ underscores\n\n* a star list'
    const p = props({ threads: [{ root: comment('c1', 'me', body), replies: [] }] })
    const r = await render(<CommentsView {...p} />)
    await click([...r.container.querySelectorAll('button')].find((b) => b.textContent === 'Edit')!)
    const v = await richView(r.container, 'edit-c1')
    await press(v, 'Enter', { ctrlKey: true })
    expect(p.onEdit).not.toHaveBeenCalled()
    expect(r.container.querySelector('#edit-c1')).toBeNull()
    await r.unmount()
  })

  it('Text outside the subset survives an edit: only the changed word differs', async () => {
    const body = '<details>open me</details>\n\nThe old plan[^1]\n\n[^1]: a footnote'
    const p = props({ threads: [{ root: comment('c1', 'me', body), replies: [] }] })
    const r = await render(<CommentsView {...p} />)
    await click([...r.container.querySelectorAll('button')].find((b) => b.textContent === 'Edit')!)
    const v = await richView(r.container, 'edit-c1')
    let at = -1
    v.state.doc.descendants((n, pos) => {
      if (n.isText && n.text!.includes('old')) at = pos + n.text!.indexOf('old')
    })
    v.dispatch(v.state.tr.insertText('new', at, at + 3))
    await press(v, 'Enter', { ctrlKey: true })
    expect(p.onEdit).toHaveBeenCalledWith('c1', '<details>open me</details>\n\nThe new plan[^1]\n\n[^1]: a footnote', [])
    await r.unmount()
  })

  it('Draft survives closing the panel', async () => {
    const r = await render(<CommentsView {...props()} />)
    const v = await richView(r.container)
    await typeText(v, 'half a thought')
    await r.unmount()
    expect(readDraft('t1')).toBe('half a thought')
    const again = await render(<CommentsView {...props()} />)
    const w = await richView(again.container)
    expect(w.state.doc.textContent).toBe('half a thought')
    await again.unmount()
  })

  it('Collapses when left empty, and the editor keys stay in the editor', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const r = await render(<CommentsView {...props()} composerHost={host} />)
    const resting = () => host.querySelector<HTMLButtonElement>('[data-composer-resting]')
    expect(resting()).toBeTruthy()
    await click(resting()!)
    const v = await richView(host)
    // The editor is a text field to the shortcut dispatcher: c, j, ? type text.
    expect(v.dom.getAttribute('contenteditable')).toBe('true')
    expect(isTypingTarget(v.dom)).toBe(true)
    const block = host.querySelector('[data-composer-block]')!
    block.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }))
    await flush(20)
    expect(resting()).toBeTruthy()
    await r.unmount()
    host.remove()
  })
})

describe('reaction bar', () => {
  it('Toggle own reaction: icons with counts, names in the accessible text', async () => {
    const onReact = vi.fn()
    const p = props({ onReact, threads: [{ root: comment('c1', 'ana', 'Lunch?', { me: ['heart'], ana: ['heart', 'thumbs_up'] }), replies: [] }] })
    const r = await render(<CommentsView {...p} />)
    const heart = r.container.querySelector<HTMLButtonElement>('[data-reaction="heart"]')!
    expect(heart.getAttribute('aria-pressed')).toBe('true')
    expect(heart.getAttribute('aria-label')).toBe('Heart: 2 (Ana, You)')
    expect(heart.textContent).toBe('2')
    expect(heart.querySelector('svg')).toBeTruthy()
    expect(r.container.querySelector('[data-reaction="thumbs_up"]')!.getAttribute('aria-pressed')).toBe('false')
    await click(heart)
    expect(onReact).toHaveBeenCalledWith('c1', 'heart')
    await r.unmount()
  })

  it('Keyboard reaction: Add reaction, then Check with Enter', async () => {
    const onReact = vi.fn()
    const p = props({ onReact, threads: [{ root: comment('c1', 'ana', 'Done?'), replies: [] }] })
    const r = await render(<CommentsView {...p} />)
    const add = r.container.querySelector<HTMLButtonElement>('[data-add-reaction]')!
    add.focus()
    await key(add, 'Enter')
    await click(add)
    await waitFor(() => !!document.querySelector('[role="menu"]'))
    const check = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitemcheckbox"]')].find((b) => b.textContent?.includes('Check'))!
    check.focus()
    await key(check, 'Enter')
    await click(check)
    expect(onReact).toHaveBeenCalledWith('c1', 'check')
    await r.unmount()
  })

  it('Deleted comment: no reactions shown, nothing to react to', async () => {
    const p = props({ threads: [{ root: comment('c1', 'ana', 'gone', { ana: ['heart'] }, 5), replies: [comment('c2', 'me', 'still here')] }] })
    const r = await render(<CommentsView {...p} />)
    expect(r.container.querySelector('[data-reaction]')).toBeNull()
    expect(r.container.querySelectorAll('[data-add-reaction]').length).toBe(1)
    await r.unmount()
  })
})
