// @vitest-environment happy-dom
// ZoneControl (task-detail-redesign 5.1, 5.2): any-zone fixing with a preview, the
// disabled state without a time, recent zones after the viewer's, and `z`.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { setDateTime } from '../../lib/dates'
import { createTask, resetDeviceId } from '../../lib/ops'
import { recordPick } from '../../lib/pickRank'
import type { Task } from '../../lib/types'
import { click, flush, key, render, type } from '../../ui/test-utils'
import { offsetLabel, ZONE_RANK_CONTEXT, ZoneControl, zoneChipText, zoneOffset } from './ZoneControl'

const BERLIN = 'Europe/Berlin'
let n = 0
beforeEach(() => {
  useDatabase(`zonectl-${Date.now()}-${n++}`)
  resetDeviceId()
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
})
afterEach(() => { setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' }) })

async function task(due: Task['due']): Promise<Task> {
  const id = await createTask({ title: 'Call Ana', due })
  return (await db.tasks.get(id))!
}
const chipOf = (c: HTMLElement) => c.querySelector('button[aria-label^="Time zone"]') as HTMLButtonElement
const panel = () => document.querySelector('[role="dialog"][aria-label="Time zone"]') as HTMLElement
const options = () => [...panel().querySelectorAll('[role="option"]')].map((o) => o.textContent ?? '')

describe('zone chip text', () => {
  it('reads Floating or city and offset at the due instant', () => {
    expect(zoneChipText({ date: '2026-11-02', time: '15:00' })).toBe('Floating')
    expect(zoneChipText({ date: '2026-11-02', time: '09:00', tz: 'America/New_York' })).toBe('New York · UTC−5')
    expect(zoneChipText({ date: '2026-07-02', time: '09:00', tz: 'America/New_York' })).toBe('New York · UTC−4')
    expect(zoneOffset('Asia/Kolkata', Date.UTC(2026, 0, 1))).toBe('UTC+5:30')
    // Every ICU spelling of a zero offset reads UTC; others keep their sign and minutes.
    for (const z of ['GMT', 'GMT+0', 'GMT-0', 'GMT+00:00']) expect(offsetLabel(z)).toBe('UTC')
    expect(offsetLabel('GMT-04:00')).toBe('UTC−4')
    expect(offsetLabel('GMT+05:30')).toBe('UTC+5:30')
    expect(offsetLabel('GMT+2')).toBe('UTC+2')
  })
})

describe('ZoneControl', () => {
  it('Meeting in another city: preview, then the due is fixed to New York', async () => {
    const t = await task({ date: '2026-11-02', time: '15:00' })
    const view = await render(<ZoneControl task={t} viewerZone={BERLIN} />)
    await click(chipOf(view.container))
    await flush(10)
    const search = panel().querySelector('input[role="combobox"]') as HTMLInputElement
    await type(search, 'New York')
    await key(search, 'Enter')
    await flush(10)
    expect(panel().querySelector('[data-testid="zone-preview"]')?.textContent).toBe('15:00 in New York = 21:00 your time (Berlin)')
    const fix = [...panel().querySelectorAll('button')].find((b) => b.textContent === 'Fix to New York')!
    await click(fix)
    await flush(20)
    expect((await db.tasks.get(t.id))!.due).toEqual({ date: '2026-11-02', time: '15:00', tz: 'America/New_York' })
    expect(panel()).toBeNull()
    await view.unmount()
  })

  it('No time set: the control is disabled and says a time is needed', async () => {
    const t = await task({ date: '2026-11-02' })
    const view = await render(<ZoneControl task={t} viewerZone={BERLIN} />)
    const chip = chipOf(view.container)
    expect(chip.disabled).toBe(true)
    expect(document.getElementById(chip.getAttribute('aria-describedby')!)?.textContent).toMatch(/Set a time/)
    await view.unmount()
  })

  it('a recently used zone is listed right after the viewer zone', async () => {
    await recordPick(ZONE_RANK_CONTEXT, 'Asia/Tokyo')
    const t = await task({ date: '2026-11-02', time: '15:00' })
    const view = await render(<ZoneControl task={t} viewerZone={BERLIN} />)
    await click(chipOf(view.container))
    await flush(30)
    const [first, second] = options()
    expect(first).toMatch(/^Berlin/)
    expect(second).toMatch(/^Tokyo/)
    await view.unmount()
  })

  it('z fixes the due to the viewer zone and releases it again', async () => {
    const t = await task({ date: '2026-11-02', time: '09:00' })
    const view = await render(<ZoneControl task={t} viewerZone={BERLIN} />)
    await key(document.body, 'z')
    await flush(20)
    const fixed = (await db.tasks.get(t.id))!
    expect(fixed.due).toEqual({ date: '2026-11-02', time: '09:00', tz: BERLIN })
    await view.rerender(<ZoneControl task={fixed} viewerZone={BERLIN} />)
    await key(document.body, 'z')
    await flush(20)
    expect((await db.tasks.get(t.id))!.due).toEqual({ date: '2026-11-02', time: '09:00' })
    await view.unmount()
  })
})
