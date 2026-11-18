// @vitest-environment happy-dom
// A tap on a link in a task's notes (OpenSpec change touch-note-links, GitHub issue
// 1529): on a touch screen a short tap on a web address opens it in a new tab (in
// the apps the shell sends it to the system browser) and a link to a project opens
// the project, without the caret; a finger that moves or stays down, and a click
// with a mouse, keep the editor's rules.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProject, createTask } from '../../lib/ops'
import { resetLinkIndex } from '../../lib/noteLinks'
import { linkTaps } from '../../lib/linkTap'
import { parseRoute } from '../router'
import { flush } from '../../ui/test-utils'
import { open, setupTaskDetailTests, waitFor } from './taskDetail.testkit'

setupTaskDetailTests()
afterEach(() => { resetLinkIndex(); vi.restoreAllMocks() })

type Point = { x: number; y: number }
function touch(type: string, at: Point | null, timeStamp: number): Event {
  const e = new Event(type, { bubbles: true, cancelable: true }) as Event & Record<string, unknown>
  const t = at ? [{ identifier: 1, clientX: at.x, clientY: at.y }] : []
  Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : t })
  Object.defineProperty(e, 'changedTouches', { value: t })
  Object.defineProperty(e, 'timeStamp', { value: timeStamp })
  return e
}

/** A finger down on `el` and up again `ms` later, `move` px further. */
function tap(el: Element, { ms = 80, move = 0 } = {}): Event {
  el.dispatchEvent(touch('touchstart', { x: 20, y: 20 }, 1000))
  const end = touch('touchend', { x: 20 + move, y: 20 }, 1000 + ms)
  el.dispatchEvent(end)
  return end
}

const editorLink = (root: ParentNode, sel: string) => root.querySelector<HTMLElement>(`.notes-editor[contenteditable] ${sel}`)

async function taskWithNotes(description: string) {
  const id = await createTask({ title: 'Plan the trip', description })
  const r = await open(id)
  return r
}

describe('a tap on a link in the notes', () => {
  it('opens a web address in a new tab and leaves the caret out', async () => {
    const opened = vi.spyOn(window, 'open').mockReturnValue(null)
    const { container, unmount } = await taskWithNotes('See [the ferry](https://example.com/ferry) and [https://example.org](https://example.org)')
    await waitFor(() => !!editorLink(container, 'a[href="https://example.com/ferry"]'), 'the link')
    const a = editorLink(container, 'a[href="https://example.com/ferry"]')!
    const end = tap(a)
    await flush()
    expect(opened).toHaveBeenCalledWith('https://example.com/ferry', '_blank', 'noopener,noreferrer')
    expect(end.defaultPrevented).toBe(true)
    expect(document.activeElement?.closest('.notes-editor')).toBeNull()
    tap(editorLink(container, 'a[href="https://example.org"]')!)
    expect(opened).toHaveBeenLastCalledWith('https://example.org', '_blank', 'noopener,noreferrer')
    await unmount()
  })

  // bare-links: an address typed as text reads as a link, and a tap opens it too.
  it('opens a bare address the editor shows as a link', async () => {
    const opened = vi.spyOn(window, 'open').mockReturnValue(null)
    const { container, unmount } = await taskWithNotes('Ferry times: https://example.com/ferry today')
    await waitFor(() => !!editorLink(container, 'a.bare-link'), 'the address as a link')
    tap(editorLink(container, 'a.bare-link')!)
    await flush()
    expect(opened).toHaveBeenCalledWith('https://example.com/ferry', '_blank', 'noopener,noreferrer')
    await unmount()
  })

  it('opens a link to a project in the app', async () => {
    const project = await createProject({ name: 'Lisbon' })
    const { container, unmount } = await taskWithNotes(`Book it with [Lisbon](?project=${project})`)
    await waitFor(() => !!editorLink(container, `a[href="?project=${project}"]`), 'the project link')
    tap(editorLink(container, `a[href="?project=${project}"]`)!)
    await waitFor(() => { const r = parseRoute(location.pathname); return r.view === 'project' && 'id' in r && r.id === project }, 'the project')
    await unmount()
  })

  it('a scroll, a long press and a mouse click do not open it', async () => {
    const opened = vi.spyOn(window, 'open').mockReturnValue(null)
    const { container, unmount } = await taskWithNotes('See [the ferry](https://example.com/ferry)')
    await waitFor(() => !!editorLink(container, 'a[href]'), 'the link')
    const a = editorLink(container, 'a[href]')!
    expect(tap(a, { move: 30 }).defaultPrevented).toBe(false)
    expect(tap(a, { ms: 800 }).defaultPrevented).toBe(false)
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(opened).not.toHaveBeenCalled()
    await unmount()
  })
})

describe('linkTaps', () => {
  const link = () => { const a = document.createElement('a'); a.href = 'https://example.com'; a.append(document.createElement('span')); document.body.append(a); return a }
  const ev = (target: Element, touches: Point[], changed: Point[], timeStamp: number) =>
    ({ target, timeStamp, touches: touches.map((p) => ({ clientX: p.x, clientY: p.y })), changedTouches: changed.map((p) => ({ clientX: p.x, clientY: p.y })) }) as unknown as TouchEvent

  it('answers the link of a short, still tap, also from inside it', () => {
    const a = link()
    const taps = linkTaps()
    taps.start(ev(a.firstElementChild!, [{ x: 5, y: 5 }], [{ x: 5, y: 5 }], 0))
    expect(taps.end(ev(a.firstElementChild!, [], [{ x: 9, y: 8 }], 200))).toBe(a)
  })

  it('answers nothing for two fingers, a move, a long press or a touch outside a link', () => {
    const a = link()
    const taps = linkTaps()
    taps.start(ev(a, [{ x: 5, y: 5 }, { x: 50, y: 5 }], [], 0))
    expect(taps.end(ev(a, [], [{ x: 5, y: 5 }], 100))).toBeNull()
    taps.start(ev(a, [{ x: 5, y: 5 }], [], 0))
    expect(taps.end(ev(a, [], [{ x: 5, y: 40 }], 100))).toBeNull()
    taps.start(ev(a, [{ x: 5, y: 5 }], [], 0))
    expect(taps.end(ev(a, [], [{ x: 5, y: 5 }], 900))).toBeNull()
    taps.start(ev(document.body, [{ x: 5, y: 5 }], [], 0))
    expect(taps.end(ev(document.body, [], [{ x: 5, y: 5 }], 100))).toBeNull()
  })
})
