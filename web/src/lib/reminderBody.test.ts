import { afterEach, describe, expect, it } from 'vitest'
import { applyCatalog } from './i18n/catalog'
import { reminderBody, tinyText } from './reminderBody'

describe('reminder notification body (arabic-rtl D5)', () => {
  afterEach(() => applyCatalog('en', 'en', {}))

  it('isolates the tiny version on the page but not in the notification', () => {
    applyCatalog('ar', 'ar', { '{tiny} is enough': '{tiny} يكفي' })
    const task = { habit: true, habit_tiny: 'one page', due: null }
    expect(tinyText(task)).toBe('⁨One page⁩ يكفي')
    expect(reminderBody(task, 0)).toBe('One page يكفي')
  })
})
