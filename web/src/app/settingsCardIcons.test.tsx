// @vitest-environment happy-dom
// Card icons and Learn more (OpenSpec change settings-refresh, settings-navigation
// "Card icons" and "Learn more links", design D1 and D2).
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { cardCopy, cardIcon, SETTINGS_COPY, type SettingsCopyId } from '../lib/settingsCopy'
import ICON_NAMES from '../ui/icons/names.json'
import { LearnMore } from '../ui/LearnMore'
import { SettingsSection } from '../ui/patterns/SettingsSection'
import { render } from '../ui/test-utils'

const helpRequest = vi.hoisted(() => ({ openHelp: vi.fn() }))
vi.mock('../lib/helpRequest', async (orig) => ({ ...(await orig<typeof import('../lib/helpRequest')>()), openHelp: helpRequest.openHelp }))

/** Every titled card, which is every card but the demo note. */
const cards = (Object.keys(SETTINGS_COPY) as SettingsCopyId[]).filter((id) => id !== 'demo')

describe('settings card icons', () => {
  it('every card has an icon from the interface set (no lazy catalogue flash)', () => {
    const names = new Set<string>(ICON_NAMES)
    const iconOf = (id: SettingsCopyId) => (SETTINGS_COPY[id] as { icon?: string }).icon
    const missing = cards.filter((id) => !iconOf(id) || !names.has(iconOf(id)!))
    expect(missing).toEqual([])
  })

  it('the icon is decorative: the heading is named by its title alone', async () => {
    const r = await render(<SettingsSection {...cardCopy('security')}><div /></SettingsSection>)
    const heading = r.container.querySelector('h2')!
    expect(heading.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    expect(heading.textContent).toBe('Passkeys')
    await r.unmount()
  })

  it('search results find the icon of a card heading, and none for a row', () => {
    expect(cardIcon('mfa-heading')).toBe('shield-check')
    expect(cardIcon('quick-add-heading')).toBe('zap')
    expect(cardIcon('first-day-of-week')).toBeUndefined()
  })
})

describe('Learn more', () => {
  it('points like a link and opens the Help screen with Enter', async () => {
    const r = await render(<LearnMore screen="settings/security" topic="Passkeys" />)
    const b = r.container.querySelector<HTMLButtonElement>('[data-learn-more]')!
    // An enabled button: the base cursor rule gives it the hand (row-and-cursor D2).
    expect(b.tagName).toBe('BUTTON')
    expect(b.disabled).toBe(false)
    expect(b.className).toContain('underline')
    expect(b.getAttribute('aria-label')).toBe('Learn more: Passkeys')
    await act(async () => {
      b.focus()
      b.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      b.click() // a focused button activates on Enter
    })
    expect(helpRequest.openHelp).toHaveBeenCalledWith('settings/security', b)
    await r.unmount()
  })
})
