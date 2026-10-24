// @vitest-environment happy-dom
// Group mentions in the comment composer and thread (OpenSpec change
// group-mentions, D4): the group comes after the people in the completion,
// picking it stores `group:<id>`, and a body that mentions it shows a group chip.
import type { EditorView } from 'prosemirror-view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MentionTarget } from '../../lib/comments'
import type { Comment } from '../../lib/types'
import { act } from 'react'
import { flush, key, render as mount, waitFor } from '../../ui/test-utils'
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
  { userId: 'group:g-adults', name: 'Adults', email: '', group: { size: 3 } },
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
  await flush(10)
}

async function typeArea(el: HTMLTextAreaElement, text: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function press(v: EditorView, k: string, mods: KeyboardEventInit = {}) {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods })
  v.someProp('handleKeyDown', (f) => f(v, ev))
  await flush(20)
}

beforeEach(() => {
  sessionStorage.clear()
  writeDraft('t1', '')
})
afterEach(async () => {
  for (const r of mounted.splice(0)) await r.unmount()
  await flush(20)
  setRichComposer(true)
  document.body.innerHTML = ''
})

describe('group mentions', () => {
  it('the rich composer offers the group after the people and stores its id', async () => {
    setRichComposer(true)
    const p = props()
    const r = await render(<CommentsView {...p} />)
    await waitFor(() => !!r.container.querySelector('[data-rich-composer] #comment-composer'), 'the rich composer')
    const v = composerViewOf(r.container.querySelector('#comment-composer')!)!
    v.focus()
    await typeText(v, '@')
    await waitFor(() => !!document.querySelector('[data-suggest="mention"]'), 'the mention list')
    const options = [...document.querySelectorAll('[data-suggest="mention"] [role="option"]')].map((o) => o.textContent)
    expect(options[0]).toContain('Anna')
    expect(options[1]).toContain('Adults')
    expect(options[1]).toContain('Group · 3 people')
    await typeText(v, 'Ad')
    await press(v, 'Enter')
    await typeText(v, 'the fence is done')
    expect(v.dom.querySelector('[data-mention="group:g-adults"]')).not.toBeNull()
    await press(v, 'Enter', { ctrlKey: true })
    await waitFor(() => (p.onCreate as ReturnType<typeof vi.fn>).mock.calls.length > 0, 'the comment to post')
    const [body, mentions] = (p.onCreate as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(body).toBe('@Adults the fence is done')
    expect(mentions).toEqual(['group:g-adults'])
  })

  it('the plain composer picks a group with the keyboard', async () => {
    const p = props({ richComposer: false })
    const r = await render(<CommentsView {...p} />)
    const area = r.container.querySelector('#comment-composer') as HTMLTextAreaElement
    area.focus()
    await typeArea(area, '@adu')
    await waitFor(() => !!document.querySelector('[role="listbox"] [data-mention-group]'), 'the group option')
    await key(area, 'Enter')
    await typeArea(area, `${area.value}hi`)
    await key(area, 'Enter', { ctrlKey: true })
    await waitFor(() => (p.onCreate as ReturnType<typeof vi.fn>).mock.calls.length > 0, 'the comment to post')
    const [body, mentions] = (p.onCreate as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(body).toBe('@Adults hi')
    expect(mentions).toEqual(['group:g-adults'])
  })

  it('renders a group mention as a group chip and a person as a person chip', async () => {
    const c = { id: 'c1', task_id: 't1', parent_id: null, body: '@Adults and @Anna, look', author_id: 'anna', mentions: ['group:g-adults', 'anna'], created_at: MON, edited_at: null, deleted_at: null, _clock: {} } as Comment
    const r = await render(<CommentsView {...props({ threads: [{ root: c, replies: [] }], richComposer: false })} />)
    const group = r.container.querySelector('[data-mention-token="Adults"]')!
    expect(group.hasAttribute('data-mention-group')).toBe(true)
    expect(group.querySelector('svg')).not.toBeNull()
    const person = r.container.querySelector('[data-mention-token="Anna"]')!
    expect(person.hasAttribute('data-mention-group')).toBe(false)
  })
})
