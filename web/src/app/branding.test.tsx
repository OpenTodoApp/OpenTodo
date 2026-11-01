// @vitest-environment happy-dom
// The themes of Settings → Server → Branding (theme-instance-default task 3.1): the
// default pickers, the server theme cards with Add from file, Offer and Remove, the
// confirmation before a theme with contrast warnings becomes a default, read-only offline.
import { describe, expect, it, vi } from 'vitest'
import { click, render, waitFor } from '../ui/test-utils'
import { BrandingThemesView, MAX_INSTANCE_THEMES, type BrandingThemesViewProps } from './BrandingThemes'
import type { ContrastFailure } from '../lib/theme/check'
import type { InstanceThemes } from '../lib/theme/instance'
import type { ThemeDocument } from '../lib/theme/format'

const doc = (name: string, kind: 'light' | 'dark'): ThemeDocument => ({
  opentodoTheme: 1, id: 'x', name, author: 'The owner', licence: 'MIT', kind,
  seeds: kind === 'dark' ? { canvas: '#2e3440', surface: '#3b4252', text: '#eceff4', accent: '#88c0d0' } : { canvas: '#fdf6e3', surface: '#fffdf5', text: '#30363d', accent: '#268bd2' },
})
const value: InstanceThemes = {
  version: 2, default: { light: '', dark: 'instance:night' },
  themes: [{ id: 'night', kind: 'dark', doc: doc('House Night', 'dark') }, { id: 'pale', kind: 'light', doc: doc('Pale', 'light') }],
}
const fail = (fg: string, bg: string): ContrastFailure => ({ theme: 'pale', fg, bg, kind: 'text', ratio: 2.1, min: 4.5 })

function view(over: Partial<BrandingThemesViewProps> = {}) {
  const props: BrandingThemesViewProps = {
    value, online: true, busy: false, error: null, catalogue: null, warnings: {}, own: [],
    onDefault: vi.fn(), onAdd: vi.fn(), onRemove: vi.fn(), ...over,
  }
  return { props, r: render(<BrandingThemesView {...props} />) }
}

const card = (side: string, id: string) => document.querySelector<HTMLButtonElement>(`[data-branding-default="${side}"] [data-theme-card="${id}"]`)

describe('BrandingThemesView', () => {
  it('shows the default of each side and sets another', async () => {
    const { props, r } = view()
    const v = await r
    expect(card('dark', 'instance:night')!.getAttribute('aria-checked')).toBe('true')
    expect(card('light', 'opentodo-light')!.getAttribute('aria-checked')).toBe('true')
    // A theme is offered on its own side only.
    expect(card('light', 'instance:night')).toBeNull()
    await click(card('dark', 'opentodo-dark')!)
    expect(props.onDefault).toHaveBeenCalledWith('dark', '')
    await click(card('light', 'instance:pale')!)
    expect(props.onDefault).toHaveBeenCalledWith('light', 'instance:pale')
    await v.unmount()
  })

  it('lists the failing pairs and asks before a theme with warnings becomes the default', async () => {
    const { props, r } = view({ warnings: { pale: [fail('text-muted', 'canvas'), fail('accent', 'surface'), fail('text', 'sunken')] } })
    const v = await r
    expect(card('light', 'instance:pale')!.textContent).toContain('Low contrast · 3')
    await click(card('light', 'instance:pale')!)
    expect(props.onDefault).not.toHaveBeenCalled()
    await waitFor(() => !!document.querySelector('[data-branding-theme-pairs]'), 'the confirmation')
    expect(document.querySelectorAll('[data-branding-theme-pairs] li')).toHaveLength(3)
    const yes = [...document.querySelectorAll<HTMLButtonElement>('[data-testid="confirm-dialog"] button')].find((b) => b.textContent === 'Make it the default')!
    await click(yes)
    expect(props.onDefault).toHaveBeenCalledWith('light', 'instance:pale')
    await v.unmount()
  })

  it('removes a server theme, offers one of the owner\'s themes and stops at the limit', async () => {
    const own = [{ id: 'mine', doc: doc('Mine', 'dark') }] as unknown as BrandingThemesViewProps['own']
    const { props, r } = view({ own })
    const v = await r
    await click(document.querySelector('[data-branding-theme-remove="pale"]')!)
    expect(props.onRemove).toHaveBeenCalledWith(value.themes[1])
    await click(document.querySelector('[data-branding-offer]')!)
    await waitFor(() => !!document.querySelector('[data-branding-offer-theme="mine"]'), 'the menu')
    await click(document.querySelector('[data-branding-offer-theme="mine"]')!)
    expect(props.onAdd).toHaveBeenCalledWith(own[0].doc)
    await v.unmount()
    const many = { ...value, themes: Array.from({ length: MAX_INSTANCE_THEMES }, (_, i) => ({ id: `t${i}`, kind: 'dark' as const, doc: doc(`T${i}`, 'dark') })) }
    const full = await view({ value: many }).r
    expect(document.querySelector<HTMLInputElement>('[data-branding-theme-file]')!.disabled).toBe(true)
    expect(document.body.textContent).toContain('The server has 20 themes; remove one to add another.')
    await full.unmount()
  })

  it('is read-only offline, with the last values read', async () => {
    const { props, r } = view({ online: false })
    const v = await r
    expect(card('dark', 'instance:night')!.getAttribute('aria-checked')).toBe('true')
    await click(card('dark', 'opentodo-dark')!)
    expect(props.onDefault).not.toHaveBeenCalled()
    expect(document.querySelector<HTMLInputElement>('[data-branding-theme-file]')!.disabled).toBe(true)
    expect(document.querySelector<HTMLButtonElement>('[data-branding-theme-remove="pale"]')!.disabled).toBe(true)
    await v.unmount()
  })
})
