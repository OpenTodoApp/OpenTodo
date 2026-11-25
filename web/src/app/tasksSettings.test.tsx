// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { resetDeviceId } from '../lib/ops'
import { render, waitFor } from '../ui/test-utils'
import { TasksSection } from './TasksSettings'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})

describe('Settings → General → Tasks (keep-open-subtasks)', () => {
  it('has one switch, on by default, that keeps open subtasks when turned off and completes them again when turned on', async () => {
    const r = await render(<TasksSection />)
    const sw = () => r.container.querySelector<HTMLButtonElement>('#tasks-complete-subtasks-switch')!
    expect(r.container.querySelectorAll('[data-setting-row]').length).toBe(1)
    expect(r.container.textContent).toContain('Complete subtasks with parent')
    expect(sw().getAttribute('aria-checked')).toBe('true')
    await act(async () => { sw().click() })
    await waitFor(async () => (await db.userPrefs.get('me'))?.complete_subtasks === 'keep', 'keep stored')
    await waitFor(() => sw().getAttribute('aria-checked') === 'false', 'switch off')
    await act(async () => { sw().click() })
    await waitFor(async () => (await db.userPrefs.get('me'))?.complete_subtasks === '', 'default stored')
    await r.unmount()
  })
})
