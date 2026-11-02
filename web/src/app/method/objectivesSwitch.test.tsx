// @vitest-environment happy-dom
// The Objectives switch in How you work (OpenSpec change plan-objectives, task 3.4).
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { applyOps, resetDeviceId } from '../../lib/ops'
import { objectivesOn } from '../../lib/objectivePrefs'
import { click, render, waitFor } from '../../ui/test-utils'
import { HowYouWorkSection } from './HowYouWorkSection'

let n = 0
beforeEach(() => {
  useDatabase(`objectives-switch-${Date.now()}-${n++}`)
  resetDeviceId()
})

const control = () => document.querySelector<HTMLInputElement>('#objectives-switch')

describe('Objectives switch', () => {
  it('is off by default, writes one op when turned on and never touches an objective', async () => {
    await applyOps([{ id: 'o1', entity: 'objective', entityId: 'ob1', field: 'title', value: 'Ship 1.0', ts: 1, device: 'other' },
      { id: 'o2', entity: 'objective', entityId: 'ob1', field: 'period', value: '2026-Q4', ts: 1, device: 'other' }])
    const r = await render(<HowYouWorkSection />)
    await waitFor(() => !!control())
    expect(control()!.getAttribute('aria-checked') ?? String(control()!.checked)).toBe('false')
    await click(control()!)
    await waitFor(async () => (await db.userPrefs.get('me'))?.objectives === 'on')
    await click(control()!)
    await waitFor(async () => (await db.userPrefs.get('me'))?.objectives === '')
    const ops = await db.outbox.toArray()
    expect(ops.map((o) => [o.entity, o.field, o.value])).toEqual([['user_prefs', 'objectives', 'on'], ['user_prefs', 'objectives', '']])
    expect(await db.objectives.get('ob1')).toMatchObject({ title: 'Ship 1.0', period: '2026-Q4' })
    await r.unmount()
  })

  it('reads an unknown value as off and keeps it', async () => {
    await applyOps([{ id: 'p1', entity: 'user_prefs', entityId: 'me', field: 'objectives', value: 'weekly', ts: 1, device: 'other' }])
    const r = await render(<HowYouWorkSection />)
    await waitFor(() => !!control())
    expect(objectivesOn(await db.userPrefs.get('me'))).toBe(false)
    expect((await db.userPrefs.get('me'))?.objectives).toBe('weekly')
    expect(await db.outbox.count()).toBe(0)
    await r.unmount()
  })
})
