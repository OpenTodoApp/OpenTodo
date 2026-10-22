// @vitest-environment happy-dom
// OpenSpec accessibility "Location and link purpose" (accessibility-aaa 6.4): every
// settings section has a heading, so a long settings page reads as sections.
import { afterEach, describe, expect, it } from 'vitest'
import { render } from '../test-utils'
import { SettingsSection } from './SettingsSection'
import { cardCopy } from '../../lib/settingsCopy'

afterEach(() => { document.body.innerHTML = '' })

describe('settings sections have headings', () => {
  it('renders its title as a heading that the section is labelled by', async () => {
    await render(<SettingsSection {...cardCopy('appearance')}><p>rows</p></SettingsSection>)
    const heading = document.querySelector('h2, h3')
    expect(heading?.textContent).toBe('Appearance')
    const section = heading?.closest('section, [role="region"], [aria-labelledby]')
    expect(section, 'the heading names its section').toBeTruthy()
  })

  it('every settings card in the copy table carries a title', () => {
    for (const id of ['appearance', 'language', 'start-view', 'date-time'] as const) {
      expect(cardCopy(id).title, id).toMatch(/\S/)
    }
    expect(cardCopy('sidebar', { variant: 'standard' }).title).toBe('Sidebar')
  })
})
