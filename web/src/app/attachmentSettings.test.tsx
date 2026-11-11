// @vitest-environment happy-dom
// Settings → Administration → Attachments (OpenSpec change attachments, task 7.4;
// settings-foundation D8, settings-navigation "Settings save behaviour").
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../lib/api'
import { click, render, waitFor } from '../ui/test-utils'
import { AttachmentSettingsPanel, AttachmentSettingsView, validateAttachmentSettings } from './AttachmentSettingsPanel'
import { navigate } from './router'

const value = { enabled: true, max_file_mb: 25, quota_mb: 1024 }

async function setNumber(el: HTMLInputElement, v: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const button = (root: HTMLElement, label: string) => [...root.querySelectorAll('button')].find((b) => b.textContent === label)

vi.mock('../lib/attachments', async (orig) => ({ ...(await orig<typeof import('../lib/attachments')>()), refreshLimits: async () => {} }))

afterEach(() => { vi.restoreAllMocks() })

describe('AttachmentSettingsView', () => {
  it('Save bar on a form: appears on a change, Discard restores, out of range keeps Save disabled', async () => {
    const onSave = vi.fn()
    const v = await render(<AttachmentSettingsView value={value} online busy={false} error={null} onToggle={() => {}} onSave={onSave} />)
    expect(v.container.querySelector('[data-help-screen]:not([data-learn-more])')).toBeNull()
    expect(v.container.querySelector('[data-save-bar]')).toBeNull()
    let perFile = v.container.querySelector<HTMLInputElement>('#attachments-max-file')!
    // The unit is inside the field, not in the label.
    expect(perFile.closest('[data-number-input]')!.textContent).toContain('MB')
    await setNumber(perFile, '4096')
    expect(v.container.textContent).toContain('Between 1 and 2048 MB')
    expect(button(v.container, 'Save')!.disabled).toBe(true)
    await click(button(v.container, 'Discard')!)
    expect(v.container.querySelector('[data-save-bar]')).toBeNull()
    perFile = v.container.querySelector<HTMLInputElement>('#attachments-max-file')!
    expect(perFile.value).toBe('25')
    await setNumber(perFile, '10')
    expect(button(v.container, 'Save')!.disabled).toBe(false)
    await click(button(v.container, 'Save')!)
    expect(onSave).toHaveBeenCalledWith({ enabled: true, max_file_mb: 10, quota_mb: 1024 })
    await v.unmount()
  })

  it('No limit clears the total and saves 0', async () => {
    const onSave = vi.fn()
    const v = await render(<AttachmentSettingsView value={value} online busy={false} error={null} onToggle={() => {}} onSave={onSave} />)
    const quota = v.container.querySelector<HTMLInputElement>('#attachments-quota')!
    await click(quota.closest('[data-number-input]')!.querySelector<HTMLInputElement>('input[type="checkbox"]')!)
    expect(quota.disabled).toBe(true)
    expect(quota.value).toBe('')
    await click(button(v.container, 'Save')!)
    expect(onSave).toHaveBeenCalledWith({ enabled: true, max_file_mb: 25, quota_mb: 0 })
    await v.unmount()
  })

  it('is read-only offline', async () => {
    const v = await render(<AttachmentSettingsView value={value} online={false} busy={false} error={null} onToggle={() => {}} onSave={() => {}} />)
    expect(v.container.textContent).toContain('You are offline')
    expect(v.container.querySelector<HTMLInputElement>('#attachments-quota')!.disabled).toBe(true)
    expect(v.container.querySelector<HTMLButtonElement>('[role="switch"]')!.disabled).toBe(true)
    await v.unmount()
  })

  it('validates', () => {
    expect(validateAttachmentSettings(value)).toBeNull()
    expect(validateAttachmentSettings({ ...value, max_file_mb: 0 })).not.toBeNull()
    expect(validateAttachmentSettings({ ...value, quota_mb: -1 })).not.toBeNull()
    expect(validateAttachmentSettings({ ...value, quota_mb: 0 })).toBeNull()
  })
})

describe('AttachmentSettingsPanel', () => {
  it('A switch saves at once, without a Save button', async () => {
    vi.spyOn(api, 'attachmentSettings').mockResolvedValue({ ...value, enabled: false })
    const save = vi.spyOn(api, 'saveAttachmentSettings').mockImplementation(async (s) => s)
    const v = await render(<AttachmentSettingsPanel />)
    await waitFor(() => !v.container.querySelector<HTMLButtonElement>('[role="switch"]')!.disabled, 'loaded')
    await click(v.container.querySelector('[role="switch"]')!)
    expect(save).toHaveBeenCalledWith({ ...value, enabled: true })
    await waitFor(() => v.container.querySelector('[role="switch"]')!.getAttribute('aria-checked') === 'true', 'on')
    expect(v.container.querySelector('[data-save-bar]')).toBeNull()
    await v.unmount()
  })

  it('Failed save: the switch returns and says why under its row', async () => {
    vi.spyOn(api, 'attachmentSettings').mockResolvedValue(value)
    vi.spyOn(api, 'saveAttachmentSettings').mockRejectedValue(new ApiError(500, 'internal', 'The disk is full'))
    const v = await render(<AttachmentSettingsPanel />)
    await waitFor(() => !v.container.querySelector<HTMLButtonElement>('[role="switch"]')!.disabled, 'loaded')
    await click(v.container.querySelector('[role="switch"]')!)
    await waitFor(() => !!v.container.querySelector('[data-attachments-toggle-error]'), 'the error')
    expect(v.container.querySelector('[role="switch"]')!.getAttribute('aria-checked')).toBe('true')
    expect(v.container.querySelector('[data-attachments-toggle-error]')!.closest('.grid')!.querySelector('[role="switch"]')).toBeTruthy()
    await v.unmount()
  })

  it('Leaving with unsaved changes asks first; Cancel keeps the page and the draft', async () => {
    history.replaceState(null, '', '/settings/server/attachments')
    window.dispatchEvent(new PopStateEvent('popstate'))
    vi.spyOn(api, 'attachmentSettings').mockResolvedValue(value)
    const v = await render(<AttachmentSettingsPanel />)
    await waitFor(() => !v.container.querySelector<HTMLInputElement>('#attachments-max-file')!.disabled, 'loaded')
    await setNumber(v.container.querySelector<HTMLInputElement>('#attachments-max-file')!, '40')
    await act(async () => { navigate({ view: 'settings', section: 'server', page: 'backups' }) })
    expect(location.pathname).toBe('/settings/server/attachments')
    const dialog = document.querySelector('[data-testid="confirm-dialog"]')!
    expect(dialog.textContent).toContain('Discard unsaved changes?')
    await click(button(dialog as HTMLElement, 'Cancel')!)
    expect(v.container.querySelector<HTMLInputElement>('#attachments-max-file')!.value).toBe('40')
    await act(async () => { navigate({ view: 'settings', section: 'server', page: 'backups' }) })
    await click(button(document.querySelector('[data-testid="confirm-dialog"]') as HTMLElement, 'Discard')!)
    expect(location.pathname).toBe('/settings/server/backups')
    await v.unmount()
  })
})
