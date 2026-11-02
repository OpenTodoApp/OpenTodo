// @vitest-environment happy-dom
// The Time sectors switch in How you work (OpenSpec change time-sectors, task 3.5).
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { applyOps, resetDeviceId } from '../../lib/ops'
import { timeSectorsOn } from '../../lib/sectorNames'
import { click, render, waitFor } from '../../ui/test-utils'
import { HowYouWorkSection } from './HowYouWorkSection'

let n = 0
beforeEach(() => {
  useDatabase(`time-sectors-switch-${Date.now()}-${n++}`)
  resetDeviceId()
})

const control = () => document.querySelector<HTMLInputElement>('#time-sectors-switch')

describe('Time sectors switch', () => {
  it('is off by default and writes one op when turned on, and clears it when turned off', async () => {
    const r = await render(<HowYouWorkSection />)
    await waitFor(() => !!control())
    expect(control()!.getAttribute('aria-checked') ?? String(control()!.checked)).toBe('false')
    await click(control()!)
    await waitFor(async () => (await db.userPrefs.get('me'))?.time_sectors === 'on')
    const ops = (await db.outbox.toArray()).filter((o) => o.entity === 'user_prefs')
    expect(ops.map((o) => [o.field, o.value])).toEqual([['time_sectors', 'on']])
    await click(control()!)
    await waitFor(async () => (await db.userPrefs.get('me'))?.time_sectors === '')
    await r.unmount()
  })

  it('reads an unknown value as off and keeps it', async () => {
    await applyOps([{ id: 'p1', entity: 'user_prefs', entityId: 'me', field: 'time_sectors', value: 'weekly', ts: 1, device: 'other' }])
    const r = await render(<HowYouWorkSection />)
    await waitFor(() => !!control())
    expect(timeSectorsOn(await db.userPrefs.get('me'))).toBe(false)
    expect((await db.userPrefs.get('me'))?.time_sectors).toBe('weekly')
    expect(await db.outbox.count()).toBe(0)
    await r.unmount()
  })
})
