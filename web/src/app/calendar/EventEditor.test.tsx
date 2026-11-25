// @vitest-environment happy-dom
// The popover editor and the grid block of an event of a connected calendar
// (calendar-event-edits 5.2, 5.3): the locked reasons, Save and Delete giving the same
// change a drag gives, an assistant's change with Undo, and a locked block that never drags.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { editEventWithUndo, undoAssistantChange } = vi.hoisted(() => ({ editEventWithUndo: vi.fn(async () => {}), undoAssistantChange: vi.fn(async () => {}) }))
vi.mock('./eventActions', () => ({ editEventWithUndo, undoAssistantChange }))

import { useDatabase } from '../../lib/db'
import type { CalendarEvent } from '../../lib/types'
import { click, render, type, waitFor } from '../../ui/test-utils'
import EventEditor from './EventEditor'
import { EventBlockView } from './EventBlock'

const ev = (o: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e1', subscriptionId: 's1', uid: 'u', summary: 'Standup', location: '', allDay: false, free: false, rev: 'r',
  start: { date: '2026-11-12', time: '09:00' }, end: { date: '2026-11-12', time: '09:30' },
  access: { update: true, delete: true }, ...o,
})
const button = (root: ParentNode, name: string) => [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)

let n = 0
beforeEach(() => {
  useDatabase(`event-editor-${Date.now()}-${n++}`)
  vi.clearAllMocks()
})

describe('EventEditor', () => {
  it('saves a new start time with the same change a drag makes, and deletes', async () => {
    const r = await render(<EventEditor ev={ev()} />)
    const form = r.container.querySelector('[data-event-edit]')!
    const start = form.querySelector<HTMLInputElement>('input[type="time"]')!
    await type(start, '15:00')
    const end = form.querySelectorAll<HTMLInputElement>('input[type="time"]')[1]
    await type(end, '15:30')
    await click(button(form, 'Save')!)
    expect(editEventWithUndo).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }), {
      start: { date: '2026-11-12', time: '15:00' }, end: { date: '2026-11-12', time: '15:30' }, allDay: false,
    })
    await click(button(form, 'Delete')!)
    expect(editEventWithUndo).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'e1' }), { delete: true })
    await r.unmount()
  })

  it('has no Delete when the calendar forbids it', async () => {
    const r = await render(<EventEditor ev={ev({ access: { update: true, delete: false, reason: 'calendar_read_only' } })} />)
    expect(button(r.container, 'Delete')).toBeUndefined()
    await r.unmount()
  })

  it.each([
    ['recurring', 'Repeating events are read-only for now'],
    ['has_guests', 'This event has guests'],
    ['not_organizer', 'Someone else organised this event'],
    ['calendar_read_only', 'This calendar is read-only'],
    ['edits_off', 'Editing events is off for this connection'],
  ] as const)('says why a %s event cannot be changed', async (reason, text) => {
    const r = await render(<EventEditor ev={ev({ access: { update: false, delete: false, reason } })} />)
    expect(r.container.querySelector('[data-event-edit]')).toBeNull()
    expect(r.container.querySelector(`[data-event-locked="${reason}"]`)!.textContent).toContain(text)
    if (reason === 'edits_off') expect(r.container.querySelector('a')!.getAttribute('href')).toBe('/settings/integrations/calendar-sync')
    await r.unmount()
  })

  it('shows an assistant\'s change with Undo', async () => {
    const r = await render(<EventEditor ev={ev({ changedBy: { kind: 'assistant', name: 'Claude' } })} />)
    expect(r.container.querySelector('[data-event-changed-by]')!.textContent).toContain('Changed by Claude')
    await click(button(r.container.querySelector('[data-event-changed-by]')!, 'Undo')!)
    expect(undoAssistantChange).toHaveBeenCalledTimes(1)
    await r.unmount()
  })
})

describe('EventBlockView', () => {
  const block = (e: CalendarEvent) => ({ id: `event:${e.id}`, start: 540, end: 570, event: e })
  const props = { date: '2026-11-12', lane: 0, lanes: 1, overlap: false, pxPerMinute: 1, minHeight: 15 }

  it('a changeable event starts a drag; a locked one never does and says why', async () => {
    const onDragStart = vi.fn()
    const r = await render(<div>
      <EventBlockView {...props} block={block(ev())} onDragStart={onDragStart} />
      <EventBlockView {...props} block={block(ev({ id: 'e2', access: { update: false, delete: false, reason: 'recurring' } }))} onDragStart={onDragStart} />
    </div>)
    const [free, locked] = [...r.container.querySelectorAll<HTMLElement>('[data-drag-id="calendar-event"]')]
    locked.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientY: 555 }))
    expect(onDragStart).not.toHaveBeenCalled()
    free.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientY: 555 }))
    await waitFor(() => onDragStart.mock.calls.length === 1)
    expect(onDragStart.mock.calls[0][1]).toMatchObject({ taskId: 'event:e1' })
    await r.unmount()
  })

  it('draws a queued change as saving', async () => {
    const r = await render(<EventBlockView {...props} block={block(ev())} command={{ key: 'c1:e1', connectionId: 'c1', eventId: 'e1', rev: 'r', base: ev(), patch: { summary: 'x' }, notBefore: 0 }} />)
    expect(r.container.querySelector('[aria-busy="true"]')).not.toBeNull()
    await r.unmount()
  })
})
