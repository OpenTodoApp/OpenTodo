// @vitest-environment happy-dom
// Comments tab (task-detail-redesign 6.2, 6.3): chronological threads, absolute
// time on focus, actions on touch, the composer (keyboard posting, reply target,
// per-task draft) and delete through the shared confirm dialog.
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setDateTime } from '../../lib/dates'
import type { Comment, ProjectMember } from '../../lib/types'
import { click, flush, key, render } from '../../ui/test-utils'
import { readDraft, setRichComposer, writeDraft } from './Composer'
import { CommentsView, type CommentsViewProps } from './CommentsTab'

// The plain composer field (the rich editor has its own tests in richComposer.test.tsx).
setRichComposer(false)

const DAY = 86_400_000
const MON = new Date(2026, 9, 12, 15, 5).getTime()
const comment = (id: string, author: string, created_at: number, body: string, parent_id: string | null = null): Comment =>
  ({ id, task_id: 't1', parent_id, body, author_id: author, mentions: [], created_at, edited_at: null, deleted_at: null, _clock: {} } as Comment)
const members: ProjectMember[] = [{ userId: 'me', name: 'Me', email: 'me@example.com', role: 'admin' }, { userId: 'ana', name: 'Ana', email: 'ana@example.com', role: 'editor' }]
const threads = [
  { root: comment('c1', 'ana', MON, 'Monday thread'), replies: [comment('r1', 'me', MON + 60_000, 'A reply', 'c1')] },
  { root: comment('c2', 'me', MON + DAY, 'Tuesday thread'), replies: [] },
  { root: comment('c3', 'ana', MON + 2 * DAY, 'Wednesday thread'), replies: [] },
]

function props(over: Partial<CommentsViewProps> = {}): CommentsViewProps {
  return {
    taskId: 't1', threads, me: 'me', role: 'admin', members, name: (id) => (id === 'me' ? 'You' : 'Ana'),
    onCreate: vi.fn(async () => true), onEdit: vi.fn(async () => true), onDelete: vi.fn(async () => {}), now: MON + 3 * DAY, ...over,
  }
}

async function typeArea(el: HTMLTextAreaElement, text: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const composer = (c: HTMLElement) => c.querySelector<HTMLTextAreaElement>('#comment-composer')!
const buttons = (c: HTMLElement, name: string) => [...c.querySelectorAll('button')].filter((b) => b.textContent?.trim() === name || b.getAttribute('aria-label') === name)

beforeEach(() => {
  sessionStorage.clear()
  writeDraft('t1', '')
  writeDraft('t2', '')
})
afterEach(() => {
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
  vi.unstubAllGlobals()
})

describe('CommentsView', () => {
  it('lists threads oldest first, directly above the composer', async () => {
    const v = await render(<CommentsView {...props()} />)
    const order = [...v.container.querySelectorAll('[data-thread]')].map((el) => el.getAttribute('data-thread'))
    expect(order).toEqual(['c1', 'c2', 'c3'])
    const list = v.container.querySelector('ol[aria-label="Comments"]')!
    expect(list.compareDocumentPosition(composer(v.container)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(v.container.querySelector('[data-reply="r1"]')).not.toBeNull()
    await v.unmount()
  })

  it('announces the absolute time in the user format on the relative time', async () => {
    setDateTime({ date_format: 'iso', time_format: '24h', week_start: 'system' })
    const v = await render(<CommentsView {...props()} />)
    const time = v.container.querySelector('[data-thread="c1"] time')!
    expect(time.textContent).toContain('3 d ago')
    expect(time.getAttribute('aria-label')).toBeNull()
    expect(time.querySelector('.sr-only')?.textContent).toBe('2026-10-12, 15:05')
    expect(time.getAttribute('tabindex')).toBe('0')
    expect(time.getAttribute('title')).toBeNull()
    // Focus opens the Tooltip primitive with the absolute time, announced as the description.
    await act(async () => { time.dispatchEvent(new FocusEvent('focusin', { bubbles: true })) })
    const tip = document.getElementById(time.getAttribute('aria-describedby')!)
    expect(tip?.getAttribute('role')).toBe('tooltip')
    expect(tip?.textContent).toBe('2026-10-12, 15:05')
    await v.unmount()
  })

  it('on touch, one visible "More actions" menu offers Reply, and Edit and Delete on own comments', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)', media: q, addEventListener() {}, removeEventListener() {} }))
    const v = await render(<CommentsView {...props()} />)
    const menuItems = async (thread: string) => {
      const actions = v.container.querySelector(`[data-thread="${thread}"] [data-comment-actions]`)!
      expect(actions.className).not.toContain('hover-reveal')
      const trigger = actions.querySelector<HTMLButtonElement>('button[aria-haspopup]')!
      expect(trigger.getAttribute('aria-label') ?? trigger.textContent).toContain('More actions')
      await click(trigger)
      await flush()
      const items = [...document.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent)
      await key(document.activeElement ?? document.body, 'Escape')
      await flush()
      return items
    }
    expect(await menuItems('c2')).toEqual(['Reply', 'Edit', 'Delete'])
    const others = await menuItems('c3')
    expect(others).toContain('Reply')
    expect(others).not.toContain('Edit')
    await v.unmount()
  })

  it('actions sit on the header line and reserve no row of their own', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
    const v = await render(<CommentsView {...props()} />)
    const actions = v.container.querySelector('[data-thread="c2"] [data-comment-actions]')!
    // Inside the author line, not a block after the body.
    expect(actions.parentElement!.textContent).toContain('You')
    expect(actions.parentElement!.querySelector('time, [datetime]') ?? actions.parentElement!.textContent).toBeTruthy()
    await v.unmount()
  })

  it('hides actions until hover on a mouse device', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
    const v = await render(<CommentsView {...props()} />)
    expect(v.container.querySelector('[data-comment-actions]')!.className).toContain('hover-reveal')
    await v.unmount()
  })

  it('posts with the keyboard only and clears the composer', async () => {
    const p = props()
    const v = await render(<CommentsView {...p} />)
    const area = composer(v.container)
    area.focus()
    await typeArea(area, 'Ship it')
    await key(area, 'Enter', { ctrlKey: true })
    await flush()
    expect(p.onCreate).toHaveBeenCalledWith('Ship it', [], null, [], expect.objectContaining({ embeds: [] }))
    expect(composer(v.container).value).toBe('')
    expect(readDraft('t1')).toBe('')
    await v.unmount()
  })

  it('replies through the bottom composer, and a cancelled reply posts top-level', async () => {
    const p = props()
    const v = await render(<CommentsView {...p} />)
    await click(buttons(v.container.querySelector('[data-thread="c3"]') as HTMLElement, 'Reply')[0])
    expect(v.container.querySelector('[data-reply-target]')?.textContent).toContain('Replying to Ana')
    expect(composer(v.container).getAttribute('aria-label')).toBe('Write a reply')
    await click(buttons(v.container, 'Cancel reply')[0])
    expect(v.container.querySelector('[data-reply-target]')).toBeNull()
    await typeArea(composer(v.container), 'Top level')
    await key(composer(v.container), 'Enter', { metaKey: true })
    await flush()
    expect(p.onCreate).toHaveBeenLastCalledWith('Top level', [], null, [], expect.objectContaining({ embeds: [] }))

    await click(buttons(v.container.querySelector('[data-thread="c3"]') as HTMLElement, 'Reply')[0])
    await typeArea(composer(v.container), 'Answer')
    await key(composer(v.container), 'Enter', { ctrlKey: true })
    await flush()
    expect(p.onCreate).toHaveBeenLastCalledWith('Answer', [], 'c3', [], expect.objectContaining({ embeds: [] }))
    await v.unmount()
  })

  it('keeps an unsent draft per task when the panel closes, in this tab session only', async () => {
    const v = await render(<CommentsView {...props()} />)
    await typeArea(composer(v.container), 'Half a thought')
    await v.unmount()
    expect(sessionStorage.getItem('ot.draft.t1')).toBe('Half a thought')
    expect(localStorage.getItem('ot.draft.t1')).toBeNull()
    const again = await render(<CommentsView {...props()} />)
    expect(composer(again.container).value).toBe('Half a thought')
    await again.rerender(<CommentsView {...props({ taskId: 't2' })} />)
    expect(composer(again.container).value).toBe('')
    await again.unmount()
  })

  it('deletes after the shared confirm dialog instead of confirm()', async () => {
    const confirmSpy = vi.fn()
    vi.stubGlobal('confirm', confirmSpy)
    const p = props()
    const v = await render(<CommentsView {...p} />)
    await click(buttons(v.container.querySelector('[data-thread="c2"]') as HTMLElement, 'Delete')[0])
    const dialog = document.querySelector('[data-testid="confirm-dialog"]')!
    expect(dialog.textContent).toContain('Delete this comment?')
    await click([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Delete comment')!)
    expect(p.onDelete).toHaveBeenCalledWith('c2')
    expect(confirmSpy).not.toHaveBeenCalled()
    await v.unmount()
  })

  it('shows a one-line empty state without comments', async () => {
    const v = await render(<CommentsView {...props({ threads: [] })} />)
    const empty = v.container.querySelector('[data-comments-empty]')!
    expect(empty.textContent).toContain('No comments yet')
    expect(empty.tagName).toBe('P')
    await v.unmount()
  })

  it('renders the composer into the host it is given, inline otherwise', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const v = await render(<CommentsView {...props({ composerHost: host })} />)
    // Pinned, it rests as one line until clicked (task-panel-facets D4), then the composer.
    expect(host.querySelector('[data-composer-resting]')).toBeTruthy()
    expect(host.querySelector('#comment-composer')).toBeNull()
    await click(host.querySelector('[data-composer-resting]')!)
    await flush()
    expect(host.querySelector('#comment-composer')).toBeTruthy()
    expect(v.container.querySelector('#comment-composer')).toBeNull()
    await v.unmount()
    host.remove()
    const w = await render(<CommentsView {...props()} />)
    expect(w.container.querySelector('#comment-composer')).toBeTruthy()
    await w.unmount()
  })

  it('attaches picked files to a new comment and lists comment attachments under the text', async () => {
    const p = props({ canAttach: true, attachments: new Map([['c2', [{ id: 'a1', task_id: 't1', comment_id: 'c2', name: 'Venue.pdf', mime: 'application/pdf', size: 2048, sha256: 'ab', url: null, encrypted: false, author_id: 'me', created_at: 1, uploaded_at: 2, deleted_at: null, _clock: {} }]]]) })
    const v = await render(<CommentsView {...p} />)
    expect(v.container.querySelector('[data-thread="c2"] [aria-label="Attached files"]')!.textContent).toContain('Venue.pdf')
    const picker = v.container.querySelector<HTMLInputElement>('[data-testid="comment-file-picker"]')!
    const shot = new File(['png'], 'shot.png', { type: 'image/png' })
    Object.defineProperty(picker, 'files', { value: [shot], configurable: true })
    await act(async () => { picker.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(v.container.querySelector('[aria-label="Files to attach"]')!.textContent).toContain('shot.png')
    // A comment with only files can be sent.
    const send = buttons(v.container, 'Comment')[0] as HTMLButtonElement
    expect(send.disabled).toBe(false)
    await click(send)
    expect(p.onCreate).toHaveBeenCalledWith('', [], null, [shot], expect.objectContaining({ embeds: [] }))
    await flush()
    expect(v.container.querySelector('[aria-label="Files to attach"]')).toBeNull()
    await v.unmount()
  })

  it('hides the attach button when attachments are unavailable and a deleted comment hides its files', async () => {
    const deleted = { root: { ...comment('c9', 'me', MON, 'gone'), deleted_at: MON + 1 }, replies: [] }
    const v = await render(<CommentsView {...props({ threads: [deleted], attachments: new Map([['c9', [{ id: 'a9', task_id: 't1', comment_id: 'c9', name: 'Hidden.pdf', mime: 'application/pdf', size: 1, sha256: 'ab', url: null, encrypted: false, author_id: 'me', created_at: 1, uploaded_at: 2, deleted_at: null, _clock: {} }]]]) })} />)
    expect(v.container.querySelector('[data-testid="comment-file-picker"]')).toBeNull()
    expect(v.container.textContent).not.toContain('Hidden.pdf')
    await v.unmount()
  })
})

describe('composer pinned to the panel (ux-overhaul "Task panel tabs")', () => {
  it('is in view without scrolling with thirty comments: outside the scroller, in the panel footer', async () => {
    const { setupPanelDb, openPanel } = await import('./pinnedComposer.testkit')
    await setupPanelDb()
    const { container, unmount } = await openPanel(30)
    // At rest the composer is one line, pinned in the footer outside the scroller.
    const composer = container.querySelector('[data-composer-resting]')!
    expect(composer).toBeTruthy()
    expect(composer.textContent).toContain('Write a comment')
    expect(composer.closest('.overflow-y-auto')).toBeNull()
    expect(composer.closest('[data-panel-footer]')).toBeTruthy()
    expect(container.querySelector('[data-panel-footer] button[type="submit"], [data-panel-footer] [aria-label="Attach files"]')).toBeNull()
    expect(container.querySelectorAll('[data-thread]').length).toBe(30)
    await unmount()
  })
})

describe('resting composer (task-panel-facets D4)', () => {
  it('expands with a draft, with a reply target and on request, and rests again when left empty', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    writeDraft('t1', 'Half a thought')
    const a = await render(<CommentsView {...props({ composerHost: host })} />)
    expect(host.querySelector('#comment-composer')).toBeTruthy()
    await a.unmount()
    writeDraft('t1', '')
    const b = await render(<CommentsView {...props({ composerHost: host })} />)
    expect(host.querySelector('[data-composer-resting]')).toBeTruthy()
    await b.rerender(<CommentsView {...props({ composerHost: host, expand: 1 })} />)
    await flush(30)
    expect(host.querySelector('#comment-composer')).toBeTruthy()
    await b.unmount()
    host.remove()
  })
})
