// @vitest-environment happy-dom
// Deadlines as dates (OpenSpec change deadline-dates): a synced choice that makes task
// rows show a deadline as its date instead of the countdown, in the same tone.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { deadlineDatesOn, setDeadlineDates } from '../lib/deadlineDates'
import { applyOps, resetDeviceId } from '../lib/ops'
import type { Task } from '../lib/types'
import { click, render, spokenText, visibleText, waitFor } from '../ui/test-utils'
import { searchSettings } from './settingsIndex'
import { AppearanceSection } from './AppearanceSection'
import { TaskRow } from './TaskRow'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
})
afterEach(() => { vi.useRealTimers() })

const task = (over: Partial<Task>): Task => ({
  id: 't', title: 'File taxes', description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0,
  created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, _clock: {}, ...over,
} as Task)
const row = (over: Partial<Task>) => render(<ul><TaskRow task={task(over)} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} /></ul>)

describe('deadlines as dates', () => {
  it('off: the row shows the countdown; on: the date, in the same tone and read as the full date', async () => {
    const off = await row({ deadline: '2026-10-17' })
    const countdown = off.container.querySelector('[data-deadline]')!
    expect(visibleText(countdown)).toBe('3d')
    const tone = countdown.className
    await off.unmount()

    await setDeadlineDates(true)
    const on = await row({ deadline: '2026-10-17' })
    await waitFor(() => visibleText(on.container.querySelector('[data-deadline]')!) !== '3d', 'the date shown')
    const date = on.container.querySelector('[data-deadline]')!
    expect(visibleText(date)).toMatch(/Oct\D*17|17\D*Oct/)
    expect(date.className).toBe(tone)
    // Read with the countdown, so a passed or near deadline is said in words, not only by colour.
    expect(spokenText(date)).toMatch(/^Deadline .*17.*, 3d$/)
    await on.unmount()
  })

  it('a past deadline keeps the danger tone as a date and is read as over', async () => {
    await setDeadlineDates(true)
    const r = await row({ deadline: '2026-10-12' })
    await waitFor(() => /12/.test(visibleText(r.container.querySelector('[data-deadline]')!)), 'the date shown')
    const el = r.container.querySelector('[data-deadline]')!
    expect(el.className).toContain('text-danger')
    expect(spokenText(el)).toMatch(/2d over$/)
    await r.unmount()
  })

  it('in a list with a time column the countdown sits in the column; a date stays with the facts', async () => {
    const timed = (over: Partial<Task>) => render(<ul><TaskRow task={task(over)} selected={false} showProject={false} onToggle={() => {}} onOpen={() => {}} timeColumn /></ul>)
    const off = await timed({ deadline: '2027-01-15' })
    expect(off.container.querySelector('[data-row-time] [data-deadline]')).toBeTruthy()
    await off.unmount()
    await setDeadlineDates(true)
    const on = await timed({ deadline: '2027-01-15' })
    await waitFor(() => !on.container.querySelector('[data-row-time] [data-deadline]'), 'out of the column')
    const el = on.container.querySelector('[data-deadline]')!
    expect(visibleText(el)).toMatch(/2027/)
    await on.unmount()
  })

  it('an empty or unknown stored value reads as off', () => {
    expect(deadlineDatesOn({ deadline_dates: '' })).toBe(false)
    expect(deadlineDatesOn({ deadline_dates: 'yes' })).toBe(false)
    expect(deadlineDatesOn(undefined)).toBe(false)
    expect(deadlineDatesOn({ deadline_dates: 'on' })).toBe(true)
  })

  it('the switch in Appearance writes one synced op, and a change from another device applies', async () => {
    vi.useRealTimers()
    const r = await render(<AppearanceSection />)
    const toggle = () => document.querySelector<HTMLButtonElement>('#appearance-deadline-dates-switch')
    await waitFor(() => !!toggle(), 'the switch')
    expect(toggle()!.getAttribute('aria-checked')).toBe('false')
    await click(toggle()!)
    await waitFor(async () => (await db.userPrefs.get('me'))?.deadline_dates === 'on', 'stored')
    await applyOps([{ id: 'd2', entity: 'user_prefs', entityId: 'me', field: 'deadline_dates', value: '', ts: Date.now() + 1000, device: 'tablet' }] as never)
    await waitFor(() => toggle()!.getAttribute('aria-checked') === 'false', 'the synced choice applied')
    await r.unmount()
  })

  it('is found by the settings search', () => {
    const user = { id: 'u1', email: 'ada@example.com', name: 'Ada', role: 'member' as const, createdAt: 1 }
    for (const q of ['deadlines as dates', 'countdown']) {
      const hits = searchSettings(q, user as never).flatMap((h) => h.entries)
      expect(hits.some((e) => e.anchor === 'appearance-deadline-dates' && e.page === 'theme')).toBe(true)
    }
  })
})
