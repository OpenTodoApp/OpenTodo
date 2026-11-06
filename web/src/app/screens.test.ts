// The screen list covers every route and Settings section (OpenSpec change
// docs-1-0, documentation "Every screen has a guide").
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ROUTE_SCREENS, SCREEN_IDS, SETTINGS_SCREENS } from './screens'
import { SETTINGS_SECTIONS } from './settingsSections'

/** The `view` names of the Route union, read from the router's source. */
function routeViews(): string[] {
  const src = readFileSync(new URL('./router.ts', import.meta.url), 'utf8')
  const union = src.slice(src.indexOf('export type Route ='), src.indexOf('\n\n', src.indexOf('export type Route =')))
  return [...new Set([...union.matchAll(/\{\s*view:\s*'([^']+)'/g)].map((m) => m[1]))].sort()
}

describe('screens', () => {
  it('names every route of the router', () => {
    const views = routeViews()
    expect(views.length).toBeGreaterThan(40)
    const missing = views.filter((v) => !(v in ROUTE_SCREENS))
    expect(missing, `routes without an entry in ROUTE_SCREENS (web/src/app/screens.ts): ${missing.join(', ')}`).toEqual([])
    expect(Object.keys(ROUTE_SCREENS).filter((v) => !views.includes(v))).toEqual([])
  })

  it('names every Settings section and sub-page', () => {
    const want = new Set<string>()
    for (const s of SETTINGS_SECTIONS) {
      want.add(`settings/${s.id}`)
      for (const p of s.pages ?? []) if (p.help) want.add(p.help)
    }
    const missing = [...want].filter((id) => !SETTINGS_SCREENS.includes(id)).sort()
    expect(missing, `Settings screens missing from SETTINGS_SCREENS (web/src/app/screens.ts): ${missing.join(', ')}`).toEqual([])
    expect(SETTINGS_SCREENS.filter((id) => !want.has(id))).toEqual([])
  })

  it('lists each id once, sorted', () => {
    expect([...SCREEN_IDS]).toEqual([...new Set(SCREEN_IDS)].sort())
  })
})
