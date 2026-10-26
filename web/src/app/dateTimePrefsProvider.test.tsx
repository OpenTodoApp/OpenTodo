// @vitest-environment happy-dom
// DateTimePrefsProvider (date-time-preferences 2.3): a written preference op
// re-renders the dates on screen without a reload.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, it } from 'vitest'
import { useDatabase } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { applyOps, resetDeviceId } from '../lib/ops'
import { setUserPref } from '../lib/userPrefs'
import { render, waitFor } from '../ui/test-utils'
import { DateTimePrefsProvider, useDateTimeFormat } from './DateTimePrefsProvider'

function Sample() {
  const f = useDateTimeFormat()
  return <p>{f.formatDate('2026-11-03', 'numeric')} · {f.formatTime('15:00')}</p>
}

let n = 0
beforeEach(() => {
  useDatabase(`dtprov-${Date.now()}-${n++}`)
  resetDeviceId()
})
afterEach(() => { setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' }) })

describe('DateTimePrefsProvider', () => {
  it('re-renders on a local change and on a synced one', async () => {
    const view = await render(<DateTimePrefsProvider><Sample /></DateTimePrefsProvider>)
    await waitFor(() => view.container.textContent!.includes('15:00'), 'the 24-hour time')

    await act(async () => { await setUserPref('time_format', '12h') })
    await waitFor(() => view.container.textContent!.includes('3:00 PM'), 'the local change')

    await act(async () => {
      await applyOps([{ id: 'r', entity: 'user_prefs', entityId: 'me', field: 'date_format', value: 'iso', ts: Date.now() + 10_000, device: 'phone' }])
    })
    await waitFor(() => view.container.textContent === '2026-11-03 · 3:00 PM', 'the synced change')
    await view.unmount()
  })
})
