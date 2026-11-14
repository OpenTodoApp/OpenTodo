// @vitest-environment happy-dom
// The in-app reminder on a touch screen or a narrow window (reminder-card-compact): one
// card for the oldest due reminder with a count of the rest, one Snooze menu with the
// three choices, and Dismiss; the next reminder shows once the first is answered. With a
// mouse on a wide window the card keeps its four buttons and due reminders stack.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import { addReminder } from '../lib/reminders'
import { click, render, waitFor } from '../ui/test-utils'
import { COMPACT_REMINDER_QUERY, ReminderToasts } from './ReminderToasts'

const originalMatchMedia = window.matchMedia
let n = 0
function media(compact: boolean) {
  window.matchMedia = ((q: string) => ({ matches: compact && q === COMPACT_REMINDER_QUERY, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
}
beforeEach(() => { useDatabase(`remcard-${Date.now()}-${n++}`); resetDeviceId() })
afterEach(() => { window.matchMedia = originalMatchMedia })

/** Two tasks whose reminders fired two minutes and one minute ago. */
async function twoDue(): Promise<string[]> {
  const ids: string[] = []
  for (const [title, ago] of [['Renew passport', 120_000], ['Call the plumber', 60_000]] as const) {
    const task = await createTask({ title, due: null })
    ids.push(await addReminder(task, { kind: 'absolute', fire_at: Date.now() - ago }))
  }
  return ids
}
const cards = () => [...document.querySelectorAll<HTMLElement>('[role="alertdialog"]')]
const button = (root: ParentNode, name: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === name)
const items = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
/** The card's controls after the task's name. */
const actions = (card: HTMLElement) => [...card.querySelectorAll('button')].map((b) => b.textContent?.trim()).slice(1)

describe('the reminder card', () => {
  it('is one compact card with a Snooze menu on touch', async () => {
    media(true)
    const [first] = await twoDue()
    const r = await render(<ReminderToasts />)
    await waitFor(() => cards().length === 1, 'one card')
    const card = cards()[0]
    expect(card.getAttribute('aria-label')).toBe('Reminder: Renew passport')
    expect(card.textContent).toContain('+1 more reminder')
    expect(actions(card)).toEqual(['Snooze', 'Dismiss'])
    const snooze = button(card, 'Snooze')!
    expect(snooze.getAttribute('aria-haspopup')).toBe('menu')
    await waitFor(() => document.activeElement === snooze, 'focus on Snooze')

    await click(snooze)
    await waitFor(() => items().length === 3, 'the snooze choices')
    expect(items().map((i) => i.textContent?.trim())).toEqual(['Snooze 10 min', '1 hour', 'Tomorrow 09:00'])
    const before = Date.now()
    await click(items()[1])
    await waitFor(async () => ((await db.reminders.get(first))?.fire_at ?? 0) >= before + 3_600_000, 'snoozed by an hour')
    expect((await db.reminders.get(first))?.dismissed_at ?? null).toBeNull()

    // The next one takes its place, and the focus the card held goes to it.
    await waitFor(() => cards()[0]?.getAttribute('aria-label') === 'Reminder: Call the plumber', 'the next reminder')
    expect(cards()[0].textContent).not.toContain('more reminder')
    await waitFor(() => document.activeElement === button(cards()[0], 'Snooze'), 'focus on the next card')
    await click(button(cards()[0], 'Dismiss')!)
    await waitFor(() => cards().length === 0, 'no card left')
    await r.unmount()
  })

  it('gives the focus back after the last answer', async () => {
    media(true)
    const field = document.createElement('button')
    document.body.append(field)
    field.focus()
    const task = await createTask({ title: 'Renew passport', due: null })
    await addReminder(task, { kind: 'absolute', fire_at: Date.now() - 60_000 })
    const r = await render(<ReminderToasts />)
    await waitFor(() => !!cards()[0] && document.activeElement === button(cards()[0], 'Snooze'), 'the card took the focus')
    await click(button(cards()[0], 'Dismiss')!)
    await waitFor(() => cards().length === 0 && document.activeElement === field, 'focus is back where it was')
    await r.unmount(); field.remove()
  })

  it('keeps its four buttons and stacks with a mouse on a wide window', async () => {
    media(false)
    await twoDue()
    const r = await render(<ReminderToasts />)
    await waitFor(() => cards().length === 2, 'two cards')
    expect(actions(cards()[0])).toEqual(['Snooze 10 min', '1 hour', 'Tomorrow 09:00', 'Dismiss'])
    await waitFor(() => document.activeElement === button(cards()[0], 'Snooze 10 min'), 'focus on the first snooze button')
    await r.unmount()
  })
})
