// @vitest-environment happy-dom
// Settings → Server → Branding (OpenSpec change instance-branding).
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { click, render } from '../ui/test-utils'
import { BrandingView, checkLogoFile } from './BrandingPanel'

const none = { name: '', logoVersion: 0 }
const branded = { name: 'Acme Tasks', logoVersion: 2 }

async function type(el: HTMLInputElement, v: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('BrandingView', () => {
  it('saves a changed name and refuses a long one', async () => {
    const onSaveName = vi.fn()
    const v = await render(<BrandingView value={none} online busy={false} error={null} onSaveName={onSaveName} onLogo={() => {}} onRemoveLogo={() => {}} />)
    const save = () => [...v.container.querySelectorAll('button')].find((b) => b.textContent === 'Save')
    // settings-foundation D8: the name is saved with the save bar, shown only while it changed.
    expect(save()).toBeUndefined()
    const input = v.container.querySelector<HTMLInputElement>('#branding-name')!
    await type(input, 'x'.repeat(41))
    expect(v.container.querySelector('[role="alert"]')!.textContent).toContain('40')
    expect(save()!.disabled).toBe(true)
    await type(input, '  Acme Tasks ')
    expect(save()!.disabled).toBe(false)
    await click(save()!)
    expect(onSaveName).toHaveBeenCalledWith('Acme Tasks')
    // Without a logo the app's own mark is the preview and there is nothing to remove.
    expect(v.container.querySelector('[data-brand-mark]')).not.toBeNull()
    expect(v.container.querySelector('[data-branding-remove]')).toBeNull()
    await v.unmount()
  })

  it('shows the current logo with a remove action and reads only offline', async () => {
    const onRemoveLogo = vi.fn()
    const v = await render(<BrandingView value={branded} online busy={false} error={null} onSaveName={() => {}} onLogo={() => {}} onRemoveLogo={onRemoveLogo} />)
    expect(v.container.querySelector<HTMLImageElement>('[data-branding-preview] img')!.getAttribute('src')).toBe('/branding/logo-192.png?v=2')
    await click(v.container.querySelector('[data-branding-remove]')!)
    expect(onRemoveLogo).toHaveBeenCalled()
    await v.unmount()
    const off = await render(<BrandingView value={branded} online={false} busy={false} error={null} onSaveName={() => {}} onLogo={() => {}} onRemoveLogo={() => {}} />)
    expect(off.container.textContent).toContain('You are offline')
    expect(off.container.querySelector<HTMLInputElement>('#branding-name')!.disabled).toBe(true)
    expect(off.container.querySelector<HTMLInputElement>('[data-branding-file]')!.disabled).toBe(true)
    await off.unmount()
  })

  it('Failed save: a refused logo says why under its row, with no save bar', async () => {
    const v = await render(<BrandingView value={branded} online busy={false} error="The image could not be read." onSaveName={() => {}} onLogo={() => {}} onRemoveLogo={() => {}} />)
    const err = v.container.querySelector('[data-branding-error]')!
    expect(err.textContent).toBe('The image could not be read.')
    expect(err.closest('.grid')!.querySelector('[data-branding-file]')).toBeTruthy()
    expect(v.container.querySelector('[data-save-bar]')).toBeNull()
    await v.unmount()
  })

  it('checks the chosen file before sending it', () => {
    expect(checkLogoFile({ type: 'image/png', size: 1000 })).toBeNull()
    expect(checkLogoFile({ type: 'image/svg+xml', size: 1000 })).not.toBeNull()
    expect(checkLogoFile({ type: 'image/png', size: 3 << 20 })).not.toBeNull()
  })
})
