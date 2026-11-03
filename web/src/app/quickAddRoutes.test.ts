import { describe, expect, it } from 'vitest'
import { LEGACY_SETTINGS_IDS, offersQuickAdd, parseRoute, routePath } from './router'
import { SETTINGS_SECTIONS } from './settingsSections'

// The floating add button shows only where quick add has a purpose (VIEW_QUICK_ADD).
describe('quick add by route', () => {
  const settingsAddresses = [
    '/settings', '/settings/import', '/settings/appearance/themes/my-theme',
    ...SETTINGS_SECTIONS.flatMap((s) => [`/settings/${s.id}`, ...(s.pages ?? []).map((p) => `/settings/${s.id}/${p.id}`)]),
    ...Object.keys(LEGACY_SETTINGS_IDS).map((id) => `/settings/${id}`),
  ]

  it.each(settingsAddresses)('has no add button on %s', (path) => {
    const r = parseRoute(path)
    expect(offersQuickAdd(r), `${path} → ${routePath(r)}`).toBe(false)
  })

  it.each(['/help', '/help/import', '/updates', '/stats', '/trash', '/routines', '/share'])('has no add button on %s', (path) => {
    expect(offersQuickAdd(parseRoute(path))).toBe(false)
  })

  it.each(['/inbox', '/today', '/upcoming', '/projects', '/week', '/notes'])('keeps the add button on %s', (path) => {
    expect(offersQuickAdd(parseRoute(path))).toBe(true)
  })
})
