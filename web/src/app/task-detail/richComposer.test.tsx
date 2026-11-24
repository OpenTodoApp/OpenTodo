// @vitest-environment happy-dom
// The rich comment composer and reactions (OpenSpec change editor-everywhere,
// tasks 5.1 and 5.2): the notes editor on a Markdown body, byte-identical when
// unchanged, text outside the subset kept, drafts, keyboard posting, and the
// reaction bar toggled by pointer and keyboard.
import { TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Comment, ProjectMember } from '../../lib/types'
import { act } from 'react'
import { Dialog } from '../../ui'
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

/** One animation frame: the composer decides on a blur a frame after it. */
const nextFrame = () => act(() => new Promise<void>((done) => requestAnimationFrame(() => done())))

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
  const done = v.someProp('handleKeyDown', (f) => f(v, ev))
  await flush()
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

  it('The formatting row is not left pressed after posting (formatting-row-pressed)', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse'), media: q, addEventListener: () => {}, removeEventListener: () => {} }))
    const p = props()
    const r = await render(<CommentsView {...p} />)
    const v = await richView(r.container)
    v.focus()
    await typeText(v, '- buy milk')
    const end = v.state.selection.from
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, end - 4, end)))
    await press(v, 'b', { ctrlKey: true })
    const pressed = () => [...r.container.querySelectorAll('[data-editor-toolbar] [aria-pressed="true"]')].map((b) => b.getAttribute('aria-label'))
    await waitFor(() => pressed().includes('Bold'), 'Bold pressed')
    expect(pressed()).toEqual(['Bold', 'Bullet list'])
    await press(v, 'Enter', { ctrlKey: true })
    await waitFor(() => (p.onCreate as ReturnType<typeof vi.fn>).mock.calls.length > 0)
    await waitFor(() => v.state.doc.textContent === '', 'the composer emptied')
    await flush()
    expect(pressed()).toEqual([])
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
    await waitFor(() => !!resting(), 'the resting composer')
    expect(resting()).toBeTruthy()
    await r.unmount()
    host.remove()
  })

  // #2030: More formatting's menu is portalled to the body; focus moving into it is
  // not leaving the composer, on a phone (a sheet) or a desktop (a panel).
  for (const phone of [false, true]) {
    it(`More formatting keeps an empty composer open and applies the pick (${phone ? 'phone' : 'desktop'})`, async () => {
      vi.stubGlobal('matchMedia', (q: string) => ({ matches: phone ? q.includes('coarse') : q.includes('min-width'), media: q, addEventListener: () => {}, removeEventListener: () => {} }))
      const host = document.createElement('div')
      document.body.appendChild(host)
      const r = await render(<CommentsView {...props()} composerHost={host} />)
      await click(host.querySelector('[data-composer-resting]')!)
      const v = await richView(host)
      v.focus()
      await flush()
      const block = host.querySelector('[data-composer-block]')!
      const more = () => host.querySelector<HTMLElement>('[data-toolbar-more]')
      // A computer shows the row on request (the Formatting toggle); a phone while the editor has focus.
      const toggle = host.querySelector<HTMLElement>('[data-composer-formatting]')
      if (!phone && toggle?.getAttribute('aria-pressed') !== 'true') await click(toggle!)
      await waitFor(() => !!more(), 'the More button')
      more()!.focus()
      await click(more()!)
      const item = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) => el.textContent?.includes('Heading'))
      await waitFor(() => !!item(), 'the More formatting menu')
      // Focus moved into the portalled menu: the composer counts it as its own.
      await waitFor(() => !!document.activeElement?.closest('[data-overlay-root]'), 'focus in the menu')
      await nextFrame()
      expect(host.querySelector('[data-composer-resting]')).toBeNull()
      expect(item()).toBeTruthy()
      await click(item()!)
      await waitFor(() => !item(), 'the menu to close')
      await waitFor(() => v.hasFocus(), 'focus back in the editor')
      await nextFrame()
      expect(v.hasFocus()).toBe(true)
      expect(host.querySelector('[data-composer-resting]')).toBeNull()
      expect(block.isConnected).toBe(true)
      expect(v.state.doc.firstChild?.type.name).toBe('heading')
      // Escape closes the menu first and leaves the composer open; then the empty composer rests.
      v.dispatch(v.state.tr.delete(0, v.state.doc.content.size))
      writeDraft('t1', '')
      await click(more()!)
      await waitFor(() => !!item(), 'the menu again')
      await key(item()!, 'Escape')
      await waitFor(() => !item(), 'the menu to close on Escape')
      expect(host.querySelector('[data-composer-resting]')).toBeNull()
      v.focus()
      expect(await press(v, 'Escape')).toBe(true)
      await waitFor(() => !!host.querySelector('[data-composer-resting]'), 'the resting composer')
      await r.unmount()
      host.remove()
    })
  }

  it('Another overlay (a dialog, Spotlight) still puts the empty composer to rest (#2030)', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const Page = ({ dialog }: { dialog: boolean }) => (
      <>
        <CommentsView {...props()} composerHost={host} />
        {dialog && <Dialog title="Elsewhere" onClose={() => {}}><button type="button">Inside the dialog</button></Dialog>}
      </>
    )
    const r = await render(<Page dialog={false} />)
    await click(host.querySelector('[data-composer-resting]')!)
    const v = await richView(host)
    v.focus()
    await waitFor(() => v.hasFocus(), 'the editor focused')
    await r.rerender(<Page dialog />)
    await waitFor(() => !!document.activeElement?.closest('[data-overlay-root]'), 'focus in the dialog')
    await waitFor(() => !!host.querySelector('[data-composer-resting]'), 'the resting composer')
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
