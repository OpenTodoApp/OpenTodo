// @vitest-environment happy-dom
// Settings → Administration → Attachments (OpenSpec change attachments, task 7.4).
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { click, render } from '../ui/test-utils'
import { AttachmentSettingsView, validateAttachmentSettings } from './AttachmentSettingsPanel'

const value = { enabled: true, max_file_mb: 25, quota_mb: 1024 }

async function setNumber(el: HTMLInputElement, v: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('AttachmentSettingsView', () => {
  it('saves changed limits and refuses values out of bounds', async () => {
    const onSave = vi.fn()
    const v = await render(<AttachmentSettingsView value={value} online busy={false} error={null} saved={false} onSave={onSave} />)
    expect(v.container.querySelector('[data-help-screen]:not([data-learn-more])')).toBeNull()
    const save = [...v.container.querySelectorAll('button')].find((b) => b.textContent === 'Save')!
    expect(save.disabled).toBe(true)
    const perFile = v.container.querySelector<HTMLInputElement>('#attachments-max-file')!
    await setNumber(perFile, '4096')
    expect(v.container.querySelector('[role="alert"]')!.textContent).toContain('1 to 2048')
    expect(save.disabled).toBe(true)
    await setNumber(perFile, '10')
    expect(save.disabled).toBe(false)
    await click(v.container.querySelector('[role="switch"]')!)
    await click(save)
    expect(onSave).toHaveBeenCalledWith({ enabled: false, max_file_mb: 10, quota_mb: 1024 })
    await v.unmount()
  })

  it('is read-only offline', async () => {
    const v = await render(<AttachmentSettingsView value={value} online={false} busy={false} error={null} saved={false} onSave={() => {}} />)
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
