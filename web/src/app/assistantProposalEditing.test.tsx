// @vitest-environment happy-dom
// Editing proposals in every shape, dragging in the calendar, proposals that grow
// over turns, and before and after (OpenSpec change assistant-proposal-editing,
// tasks 1.1 to 1.4).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyChanges, reviewChangeSet, type Review } from '../lib/assistant'
import type { ProposedChange } from '../lib/assistantTypes'
import { editReviewItem } from '../lib/assistantShape'
import { resetSkills } from '../lib/assistantSkills'
import { openAssistantWith, resetAssistantStatus, setAssistantStatus, type AssistantStatus } from '../lib/assistantStatus'
import { db } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import { click, key, render, type, waitFor } from '../ui/test-utils'
import { AssistantPanel } from './assistant/AssistantPanel'
import { ChangeSetReview } from './assistant/ChangeSetReview'

const noop = () => {}
const status: AssistantStatus = {
  available: true, enabled: true, reason: '', provider: 'anthropic', provider_label: 'Anthropic (Claude)', model: 'm', consented: true,
  disclosure_version: 4, fields: [], allow_member_keys: false, own_key_set: false, operator_key_set: true,
}
const sse = (...events: [string, unknown][]) => events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('')
let reply = () => ''
let turns: { messages: { text: string }[]; open_proposal?: ProposedChange[] }[] = []
beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  resetAssistantStatus()
  resetSkills([])
  setAssistantStatus(status)
  turns = []
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/api/v1/me/assistant') return new Response(JSON.stringify(status), { status: 200 })
    if (path === '/api/v1/assistant/skills') return new Response(JSON.stringify({ skills: [] }), { status: 200 })
    if (path === '/api/v1/assistant/turn') {
      turns.push(JSON.parse(String(init?.body)))
      return new Response(reply(), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    }
    throw new TypeError('offline')
  }))
})
afterEach(() => vi.unstubAllGlobals())

const TUE = '2026-11-17'
const WED = '2026-11-18'
const move = (id: string, date: string): ProposedChange => ({ entity: 'task', entityId: id, patch: { due: { date } }, base: { due: null } })

/** The card over a live review that edits like the panel does. */
async function card(changes: ProposedChange[]) {
  let review: Review = await reviewChangeSet(changes)
  const r = await render(<div />)
  const draw = () => r.rerender(
    <ChangeSetReview review={review} result={null} busy={false} shapes onApply={noop} onDiscard={noop} onUndo={noop}
      onToggle={(i, c) => { review = { ...review, items: review.items.map((it, j) => (j === i ? { ...it, checked: c } : it)) }; void draw() }}
      onEdit={(i, e) => { void editReviewItem(review, i, e).then((next) => { review = next; void draw() }) }} />,
  )
  await draw()
  return { r, review: () => review }
}

describe('edits in every shape (1.1)', () => {
  it('the calendar, the outline and the map open the list editor from each item’s pencil', async () => {
    const [a, b] = await Promise.all(['Draft the plan', 'Review the plan'].map((title) => createTask({ title })))
    const cal = await card([move(a, TUE), move(b, WED)])
    await waitFor(() => cal.r.container.querySelectorAll('[data-proposal-calendar] [data-edit-item]').length === 2, 'pencils in the calendar')
    await click(cal.r.container.querySelector(`[data-agenda-item="${b}"] [data-edit-item]`)!)
    const time = () => cal.r.container.querySelector<HTMLInputElement>('[data-edit-field="time"]')
    await waitFor(() => !!time(), 'the editor with a time')
    await type(time()!, '14:30')
    await key(time()!, 'Enter')
    await waitFor(() => !!cal.r.container.querySelector(`[data-agenda-item="${b}"]`)?.textContent?.includes('14:30'), 'the time set')
    expect(cal.review().items[1].change.patch.due).toEqual({ date: WED, time: '14:30' })
    expect(cal.review().items[1].edited).toBe(true)

    const outline = await card([
      { entity: 'project', entityId: 'p', create: true, patch: { name: 'Garden' } },
      { entity: 'task', entityId: 'n', create: true, patch: { title: 'Buy seeds', project_id: 'p' } },
    ])
    await waitFor(() => outline.r.container.querySelectorAll('[data-proposal-outline] [data-edit-item]').length === 2, 'pencils in the outline')
    await click(outline.r.container.querySelector('[data-review-item="n"] [data-edit-item]')!)
    const title = outline.r.container.querySelector<HTMLInputElement>('[data-edit-field="title"]')!
    await type(title, 'Buy tomato seeds')
    await key(title, 'Enter')
    await waitFor(() => outline.review().items[1].change.patch.title === 'Buy tomato seeds', 'the title edited')
    await waitFor(() => !!outline.r.container.querySelector('[data-review-item="n"] [data-edited]'), 'marked edited')
  })
})

describe('drag in the calendar shape (1.2)', () => {
  it('drag to another day: the task is due Wednesday once applied, and the item was marked edited', async () => {
    const [a, b] = await Promise.all(['Draft the plan', 'Review the plan'].map((title) => createTask({ title })))
    const { r, review } = await card([move(a, TUE), move(b, TUE)])
    const row = () => r.container.querySelector<HTMLElement>(`[data-agenda-item="${a}"] label`)!
    await waitFor(() => !!r.container.querySelector(`[data-agenda-day="${TUE}"] [data-agenda-item="${a}"]`), 'the calendar')
    // The proposal spans Tuesday only: add Wednesday by moving the other item with the keys first.
    row().focus()
    const wed = () => r.container.querySelector<HTMLElement>(`[data-agenda-day="${WED}"]`)
    await key(r.container.querySelector<HTMLElement>(`[data-agenda-item="${b}"] label`)!, 'ArrowDown', { altKey: true })
    await waitFor(() => !!wed()?.querySelector(`[data-agenda-item="${b}"]`), 'moved with Alt+↓')
    expect(r.container.querySelector('[data-proposal-moved]')!.textContent).toContain('Review the plan')
    // Now drag the first one onto Wednesday.
    const spy = vi.spyOn(document, 'elementFromPoint').mockImplementation(() => wed())
    row().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10 }))
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 60 }))
    await waitFor(() => wed()!.className.includes('bg-accent-soft'), 'Wednesday marked as the drop target')
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 60 }))
    spy.mockRestore()
    await waitFor(() => !!wed()?.querySelector(`[data-agenda-item="${a}"]`), 'dropped on Wednesday')
    const item = review().items[0]
    expect(item.change.patch.due).toEqual({ date: WED })
    expect(item.edited).toBe(true)
    await applyChanges(review().items.map((i) => i.change))
    expect((await db.tasks.get(a))!.due).toEqual({ date: WED })
  })
})

describe('proposals that grow (1.3)', () => {
  it('also add a task: the open proposal goes with the turn, the card shows the 3 moves and the new task marked added', async () => {
    const ids = await Promise.all(['Pay rent', 'Call mum', 'Water plants'].map((title) => createTask({ title })))
    const moves = ids.map((id) => move(id, TUE))
    reply = () => sse(['text', { text: 'Proposed.' }], ['changeset', { items: moves, limit: 50 }], ['done', { stop_reason: 'end_turn' }])
    openAssistantWith({ text: 'move these to Tuesday', send: true })
    await render(<AssistantPanel onClose={noop} context={() => ({ view: 'today' })} onApplied={noop} />)
    await waitFor(() => document.querySelectorAll('[data-assistant-review] input[type="checkbox"]').length === 3, 'the proposal')
    // Uncheck one: an unchanged item keeps its checkbox through the next turn.
    await click(document.querySelector<HTMLInputElement>(`[data-agenda-item="${ids[2]}"] input`)!)
    const plumber: ProposedChange = { entity: 'task', entityId: 'new-plumber', create: true, patch: { title: 'Call the plumber', project_id: null, priority: 4, labels: [] } }
    reply = () => sse(['text', { text: 'Added it.' }], ['changeset', { items: [...moves, plumber], limit: 50 }], ['done', { stop_reason: 'end_turn' }])
    const field = document.querySelector<HTMLTextAreaElement>('[data-assistant-panel] textarea')!
    await type(field, 'also add a task to call the plumber')
    await key(field, 'Enter')
    await waitFor(() => turns.length === 2, 'the second turn')
    expect(turns[0].open_proposal).toBeUndefined()
    expect(turns[1].open_proposal!.map((c) => c.entityId)).toEqual(ids)
    await waitFor(() => document.querySelectorAll('[data-assistant-review] [data-review-item]').length === 4, 'the amended proposal')
    const added = document.querySelector('[data-review-item="new-plumber"] [data-turn]')!
    expect(added.getAttribute('data-turn')).toBe('added')
    expect(document.querySelectorAll('[data-turn]')).toHaveLength(1)
    const boxes = [...document.querySelectorAll<HTMLInputElement>('[data-assistant-review] [data-review-item] input[type="checkbox"]')]
    expect(boxes.filter((b) => !b.checked)).toHaveLength(1)
  })

  it('a turn that fails leaves the open proposal as it was; a dropped item is named', async () => {
    const ids = await Promise.all(['Pay rent', 'Call mum'].map((title) => createTask({ title })))
    reply = () => sse(['changeset', { items: ids.map((id) => move(id, TUE)), limit: 50 }], ['done', { stop_reason: 'end_turn' }])
    openAssistantWith({ text: 'move these to Tuesday', send: true })
    await render(<AssistantPanel onClose={noop} context={() => ({ view: 'today' })} onApplied={noop} />)
    await waitFor(() => document.querySelectorAll('[data-assistant-review] input[type="checkbox"]').length === 2, 'the proposal')
    reply = () => sse(['error', { code: 'provider_error', message: 'down' }])
    const field = document.querySelector<HTMLTextAreaElement>('[data-assistant-panel] textarea')!
    await type(field, 'and Friday?')
    await key(field, 'Enter')
    await waitFor(() => turns.length === 2 && document.querySelectorAll('[data-assistant-review] input[type="checkbox"]').length === 2, 'the proposal kept')
    reply = () => sse(['changeset', { items: [move(ids[0], TUE)], limit: 50 }], ['done', { stop_reason: 'end_turn' }])
    await type(field, 'drop Call mum')
    await key(field, 'Enter')
    await waitFor(() => turns.length === 3 && document.querySelectorAll('[data-assistant-review] input[type="checkbox"]').length === 1, 'one item left')
    expect(turns[2].open_proposal).toHaveLength(2)
    expect(document.querySelector('[data-assistant-review]')!.textContent).toContain('Removed this turn')
  })
})

describe('before and after (1.4)', () => {
  it('the switch shows each item’s value now and the proposed one', async () => {
    const id = await createTask({ title: 'Pay rent', priority: 4 })
    const { r } = await card([{ entity: 'task', entityId: id, patch: { priority: 1, due: { date: WED } }, base: { priority: 4, due: null } }])
    const toggle = r.container.querySelector<HTMLButtonElement>('[data-before-after-switch]')!
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    await click(toggle)
    await waitFor(() => !!r.container.querySelector('[data-before-after] [data-after="priority"]'), 'the before and after view')
    expect(r.container.querySelector('[data-before="priority"]')!.textContent).toBe('None')
    expect(r.container.querySelector('[data-after="priority"]')!.textContent).toBe('P1')
    expect(r.container.querySelector('[data-before="due"]')!.textContent).toBe('—')
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
  })
})
