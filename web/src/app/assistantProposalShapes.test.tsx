// @vitest-environment happy-dom
// A proposal in its own shape and edits before applying (OpenSpec change
// assistant-generative-ui, tasks 5.2, 5.3).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reviewChangeSet, type Review } from '../lib/assistant'
import type { ProposedChange } from '../lib/assistantTypes'
import { resetSkills } from '../lib/assistantSkills'
import { openAssistantWith, resetAssistantStatus, setAssistantStatus, type AssistantStatus } from '../lib/assistantStatus'
import { db, setMeta } from '../lib/db'
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
beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  resetAssistantStatus()
  resetSkills([])
  setAssistantStatus(status)
  vi.stubGlobal('fetch', vi.fn(async (path: string) => {
    if (path === '/api/v1/me/assistant') return new Response(JSON.stringify(status), { status: 200 })
    if (path === '/api/v1/assistant/skills') return new Response(JSON.stringify({ skills: [] }), { status: 200 })
    if (path === '/api/v1/assistant/turn') return new Response(reply(), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    // Offline otherwise: nothing syncs.
    throw new TypeError('offline')
  }))
})
afterEach(() => vi.unstubAllGlobals())

/** The card with a live review the test can toggle and apply. */
async function card(changes: ProposedChange[], onApply = vi.fn()) {
  let review: Review = await reviewChangeSet(changes)
  const r = await render(<div />)
  const draw = () => r.rerender(
    <ChangeSetReview review={review} result={null} busy={false} shapes onApply={onApply} onDiscard={noop} onUndo={noop}
      onToggle={(i, c) => { review = { ...review, items: review.items.map((it, j) => (j === i ? { ...it, checked: c } : it)) }; void draw() }} />,
  )
  await draw()
  return { r, onApply, review: () => review }
}

describe('proposal shapes (5.2)', () => {
  it('a week plan shows as a calendar with the proposed items marked, and as the same checked list', async () => {
    await createTask({ title: 'Standup', due: { date: '2026-11-16', time: '09:00' } })
    const ids = await Promise.all(['A', 'B', 'C', 'D', 'E', 'F'].map((title) => createTask({ title })))
    const dates = ['2026-11-16', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']
    const { r, onApply } = await card(ids.map((id, i) => ({ entity: 'task', entityId: id, patch: { due: { date: dates[i] } }, base: { due: null } })))
    const root = () => r.container.querySelector<HTMLElement>('[data-assistant-review]')!
    await waitFor(() => r.container.querySelectorAll('[data-agenda-item][data-proposed]').length === 6, 'the calendar')
    expect(root().dataset.shape).toBe('calendar')
    expect([...r.container.querySelectorAll('[data-agenda-day]')].map((d) => (d as HTMLElement).dataset.agendaDay)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'])
    // The day's existing task shows beside the proposed ones, without a checkbox.
    expect(r.container.querySelector('[data-agenda-day="2026-11-16"]')!.textContent).toContain('Standup')
    expect(r.container.querySelectorAll('[data-agenda-item] input[type="checkbox"]')).toHaveLength(6)
    // Uncheck one in the calendar; the count follows.
    await click(r.container.querySelector<HTMLInputElement>(`[data-agenda-item="${ids[0]}"] input`)!)
    await waitFor(() => r.container.querySelector('[data-assistant-selected]')!.textContent === '5 of 6 selected', 'the count')
    // The list: the same six items, the same one unchecked.
    await click([...r.container.querySelectorAll<HTMLButtonElement>('[data-shape-switch] button')].find((b) => b.textContent === 'List')!)
    await waitFor(() => root().dataset.shape === 'list', 'the list')
    const boxes = [...r.container.querySelectorAll<HTMLInputElement>('[data-review-item] input[type="checkbox"]')]
    expect(boxes.map((b) => b.checked)).toEqual([false, true, true, true, true, true])
    // Keyboard only: Enter in the card applies.
    boxes[1].focus()
    await key(boxes[1], 'Enter')
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('a new project shows as an outline: the project, its sections and their tasks', async () => {
    const { r } = await card([
      { entity: 'project', entityId: 'p', create: true, patch: { name: 'Move flat' } },
      { entity: 'section', entityId: 's1', create: true, patch: { name: 'Pack', project_id: 'p' } },
      { entity: 'section', entityId: 's2', create: true, patch: { name: 'Paperwork', project_id: 'p' } },
      { entity: 'task', entityId: 't1', create: true, patch: { title: 'Buy boxes', project_id: 'p', section_id: 's1' } },
      { entity: 'task', entityId: 't2', create: true, patch: { title: 'Forward the post', project_id: 'p', section_id: 's2' } },
      { entity: 'task', entityId: 't3', create: true, patch: { title: 'Ask for boxes at work', project_id: 'p', parent_id: 't1' } },
    ])
    await waitFor(() => !!r.container.querySelector('[data-proposal-outline]'), 'the outline')
    const nested = (id: string) => r.container.querySelector(`[data-review-item="${id}"]`)!
    expect(nested('p').contains(nested('s1'))).toBe(true)
    expect(nested('s1').contains(nested('t1'))).toBe(true)
    expect(nested('t1').contains(nested('t3'))).toBe(true)
    expect(nested('s2').contains(nested('t2'))).toBe(true)
    expect(r.container.querySelectorAll('[data-proposal-outline] input[type="checkbox"]')).toHaveLength(6)
  })

  it('an outline lists every item it cannot place in the tree, so each keeps its checkbox', async () => {
    const { r } = await card([
      { entity: 'project', entityId: 'p', create: true, patch: { name: 'Move flat' } },
      { entity: 'task', entityId: 't1', create: true, patch: { title: 'In a section that is not new', project_id: 'p', section_id: 'old-section' } },
      { entity: 'label', entityId: 'l1', create: true, patch: { name: 'moving' } },
    ])
    await waitFor(() => !!r.container.querySelector('[data-proposal-outline]'), 'the outline')
    expect(r.container.querySelectorAll('[data-proposal-outline] input[type="checkbox"]')).toHaveLength(3)
    expect(r.container.querySelector('[data-review-item="t1"]')).not.toBeNull()
  })

  it('a proposal that sets places shows as a map with one checkbox per item, while maps are on', async () => {
    await setMeta('mapsAvailable', true)
    const ids = await Promise.all(['Pick up parcel', 'Buy ink'].map((title) => createTask({ title })))
    const places = [{ name: 'Post office', lat: 52.5, lon: 13.4 }, { name: 'Stationer', lat: 52.51, lon: 13.41 }]
    const { r } = await card(ids.map((id, i) => ({ entity: 'task', entityId: id, patch: { location: places[i] }, base: { location: null } })))
    await waitFor(() => !!r.container.querySelector('[data-proposal-map]'), 'the map shape')
    expect(r.container.querySelectorAll('[data-proposal-map] input[type="checkbox"]')).toHaveLength(2)
    expect(r.container.querySelector('[data-proposal-map]')!.textContent).toContain('Stationer')
  })

  it('bulk actions keep the list whatever the changes', async () => {
    const ids = await Promise.all(['A', 'B'].map((title) => createTask({ title })))
    const review = await reviewChangeSet(ids.map((id) => ({ entity: 'task', entityId: id, patch: { due: { date: '2026-11-16' } }, base: { due: null } })))
    const r = await render(<ChangeSetReview review={review} result={null} busy={false} onToggle={noop} onApply={noop} onDiscard={noop} onUndo={noop} />)
    expect(r.container.querySelector<HTMLElement>('[data-assistant-review]')!.dataset.shape).toBe('list')
    expect(r.container.querySelector('[data-shape-switch]')).toBeNull()
  })
})

describe('edits before applying (5.3)', () => {
  it('a proposed task created with the edited title and date, marked edited, offline, and Undo moves it to the Trash', async () => {
    const proposal = { items: [{ entity: 'task', entityId: 'new-landlord', create: true, patch: { title: 'Call landlord', description: '', project_id: null, parent_id: null, priority: 4, due: { date: '2026-11-13' }, labels: [], position: 1, created_at: Date.now(), completed_at: null, deleted_at: null } }], limit: 50 }
    reply = () => sse(['text', { text: 'Proposed.' }], ['changeset', proposal], ['done', { stop_reason: 'end_turn' }])
    openAssistantWith({ text: 'remind me to call the landlord on Friday', send: true })
    await render(<AssistantPanel onClose={noop} context={() => ({ view: 'today' })} onApplied={noop} />)
    await waitFor(() => !!document.querySelector('[data-edit-item]'), 'the proposal with Edit')
    await click(document.querySelector('[data-edit-item]')!)
    const field = (f: string) => document.querySelector<HTMLInputElement>(`[data-edit-field="${f}"]`)!
    await waitFor(() => field('title')?.value === 'Call landlord', 'the editor')
    await type(field('title'), 'Call landlord about deposit')
    await type(field('due'), '2026-11-12')
    // Enter in the editor keeps the edit; it does not apply the proposal.
    await key(field('due'), 'Enter')
    await waitFor(() => !!document.querySelector('[data-review-item] [data-edited]'), 'marked edited')
    expect(await db.tasks.get('new-landlord')).toBeUndefined()
    expect(document.querySelector('[data-review-item]')!.textContent).toContain('Call landlord about deposit')
    await click(document.querySelector('[data-assistant-apply]')!)
    await waitFor(async () => !!(await db.tasks.get('new-landlord')), 'applied')
    const task = (await db.tasks.get('new-landlord'))!
    expect(task.title).toBe('Call landlord about deposit')
    expect(task.due).toEqual({ date: '2026-11-12' })
    expect((await db.outbox.toArray()).some((op) => op.entityId === 'new-landlord')).toBe(true)
    await waitFor(() => !!document.querySelector('[data-assistant-result] button'), 'Undo')
    await click(document.querySelector('[data-assistant-result] button')!)
    await waitFor(async () => !!(await db.tasks.get('new-landlord'))!.deleted_at, 'in the Trash')
  })

  it('Enter on Cancel cancels the edit; Enter in a field keeps it', async () => {
    const edits: unknown[] = []
    const review = await reviewChangeSet([{ entity: 'task', entityId: 'n', create: true, patch: { title: 'Call landlord', due: { date: '2026-11-13' } } }])
    const r = await render(<ChangeSetReview review={review} result={null} busy={false} shapes onToggle={noop} onApply={noop} onDiscard={noop} onUndo={noop} onEdit={(_i, e) => edits.push(e)} />)
    await click(r.container.querySelector('[data-edit-item]')!)
    await type(r.container.querySelector<HTMLInputElement>('[data-edit-field="title"]')!, 'Something else')
    const cancel = [...r.container.querySelectorAll<HTMLButtonElement>('[data-assistant-editor] button')].find((b) => b.textContent === 'Cancel')!
    await key(cancel, 'Enter')
    expect(edits).toEqual([])
  })

  it('a wrong value shows its error and keeps the proposal as it was', async () => {
    const { r } = await (async () => {
      let review: Review = await reviewChangeSet([{ entity: 'task', entityId: 'n', create: true, patch: { title: 'Call landlord', due: { date: '2026-11-13' } } }])
      const out = await render(<div />)
      const draw = () => out.rerender(<ChangeSetReview review={review} result={null} busy={false} shapes onToggle={noop} onApply={noop} onDiscard={noop} onUndo={noop}
        onEdit={() => { review = { ...review, items: review.items.map((it) => ({ ...it, edited: true })) }; void draw() }} />)
      await draw()
      return { r: out }
    })()
    await click(r.container.querySelector('[data-edit-item]')!)
    await type(r.container.querySelector<HTMLInputElement>('[data-edit-field="title"]')!, '   ')
    await click(r.container.querySelector('[data-edit-done]')!)
    expect(r.container.textContent).toContain('Enter a title.')
    expect(r.container.querySelector('[data-edited]')).toBeNull()
  })
})
