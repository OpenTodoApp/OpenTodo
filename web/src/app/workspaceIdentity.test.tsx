// @vitest-environment happy-dom
// Settings → Workspaces → General (OpenSpec change settings-foundation, design D8):
// the name and colour are one form with the save bar; the icon applies when picked.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Workspace } from '../lib/types'
import { workspaceApi } from '../lib/workspaceApi'
import { click, render, type } from '../ui/test-utils'
import { IdentitySection } from './WorkspaceGeneral'

const ws: Workspace = { id: 'w1', name: 'Family', icon: '', color: '', default: false, role: 'owner', ownerId: 'u1' }
const bar = () => document.querySelector('[data-save-bar]')
const barButton = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('[data-save-bar] button')].find((b) => b.textContent === label)!

afterEach(() => { vi.restoreAllMocks() })

describe('workspace name and colour', () => {
  it('Save bar on a form: name and colour save together; Discard restores both', async () => {
    const update = vi.spyOn(workspaceApi, 'update').mockResolvedValue(undefined as never)
    const r = await render(<IdentitySection ws={ws} online />)
    expect(bar()).toBeNull()
    await click(document.querySelector<HTMLButtonElement>('[data-workspace-colours] [role="radio"]:nth-child(2)')!)
    expect(update).not.toHaveBeenCalled()
    expect(bar()).not.toBeNull()
    await click(barButton('Discard'))
    expect(bar()).toBeNull()
    await type(document.querySelector<HTMLInputElement>('[data-workspace-name]')!, 'Home')
    await click(document.querySelector<HTMLButtonElement>('[data-workspace-colours] [role="radio"]:nth-child(2)')!)
    await click(barButton('Save'))
    expect(update).toHaveBeenCalledTimes(1)
    const [, patch] = update.mock.calls[0]
    expect(patch.name).toBe('Home')
    expect(patch.color).toMatch(/^#/)
    await r.unmount()
  })

  it('an empty name keeps Save disabled', async () => {
    const r = await render(<IdentitySection ws={ws} online />)
    await type(document.querySelector<HTMLInputElement>('[data-workspace-name]')!, '  ')
    expect(barButton('Save').disabled).toBe(true)
    await r.unmount()
  })
})
