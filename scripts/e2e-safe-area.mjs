// Safe-area check (GitHub issue 973): opens every screen and overlay of the layout
// check (scripts/ux-audit/layout-screens.mjs) as the installed app on a phone with a
// Dynamic Island, in portrait (390 × 844, insets 59 px at the top and 34 px at the
// bottom) and in landscape (844 × 390, 59 px left and right, 21 px at the bottom),
// and fails when a control that can be tapped sits in one of those strips
// (insetOverlaps in scripts/ux-audit/measure.mjs): under the island, the status bar,
// the home indicator or a rounded side.
//
// The insets are emulated, and the app runs in standalone display mode (the
// display-mode media query and navigator.standalone answer as an installed app):
//   - Chromium: the DevTools protocol's safe-area override, so `env(safe-area-inset-*)`
//     itself returns the insets, wherever it is written;
//   - WebKit: Playwright cannot set the insets, so the app's safe-area tokens
//     (--safe-top/-right/-bottom/-left in web/src/index.css, the only place that reads
//     env(); `make ui-lint` keeps it so) are set to them instead.
//
//   node scripts/e2e-safe-area.mjs [report-dir]        (default: safe-area-report)
//
// Run it against a FRESH data directory (it seeds the owner account through the API).
// Env: OPENTODO_URL (default http://127.0.0.1:8080), ENGINES (default chromium),
// ORIENTATIONS (default portrait,landscape), ONLY (comma-separated screen names),
// SHOTS=all (a screenshot of every screen and overlay, not only of failures),
// LAYOUT_DATE (as the layout check), CHROMIUM_PATH / WEBKIT_PATH.
const pw = await import('playwright').catch(async () => {
  const { createRequire } = await import('node:module')
  const { execSync } = await import('node:child_process')
  return createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')
})
import { mkdirSync, writeFileSync } from 'node:fs'
import { insetOverlaps } from './ux-audit/measure.mjs'
import { calendarEvents, seed as seedAccount } from './ux-audit/seed.mjs'
import { OVERLAYS, chooseLayout, screens } from './ux-audit/layout-screens.mjs'

const base = process.env.OPENTODO_URL ?? 'http://127.0.0.1:8080'
const outDir = process.argv[2] ?? 'safe-area-report'
const ENGINES = (process.env.ENGINES ?? 'chromium').split(',').filter(Boolean)
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null
const SHOTS_ALL = process.env.SHOTS === 'all'
const LAYOUT_DATE = process.env.LAYOUT_DATE ?? '2026-11-01'
const NOW = new Date(`${LAYOUT_DATE}T09:00:00Z`).getTime()
// An iPhone with a Dynamic Island, as Safari reports it to an installed web app.
const ORIENTATIONS = {
  portrait: { viewport: { width: 390, height: 844 }, insets: { top: 59, right: 0, bottom: 34, left: 0 } },
  landscape: { viewport: { width: 844, height: 390 }, insets: { top: 0, right: 59, bottom: 21, left: 59 } },
}
// Full-screen pages the layout check leaves to the interface audit (scripts/ux-audit/screens.json).
const EXTRA = [
  { name: 'focus', path: '/focus', ready: (p) => p.locator('main').first().waitFor() },
  { name: 'theme-editor', path: '/settings/appearance/themes/none', ready: (p) => p.locator('main h1').first().waitFor() },
]
// Overlays left out, with the reason: the seeded reminder toast is dismissed by whichever
// run closes it first (both orientations share the account; the toast region is checked
// with the bulk toast), and the drawer's view menu opener needs the phone drawer, which
// landscape (a 768 px layout and up) does not have.
const SKIP = new Set(['reminder-toast', 'sidebar-view-menu@landscape'])
const WANT =(process.env.ORIENTATIONS ?? 'portrait,landscape').split(',').filter(Boolean)
mkdirSync(outDir, { recursive: true })
const failures = []
const log = (...a) => console.log(...a)

// Runs before the app: an installed app's display mode, and (WebKit) the safe-area tokens.
function standalone(tokens) {
  const mm = window.matchMedia.bind(window)
  window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { matches: true, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false } : mm(q))
  try { Object.defineProperty(navigator, 'standalone', { get: () => true }) } catch { /* read-only */ }
  if (!tokens) return
  const css = `:root{--safe-top:${tokens.top}px!important;--safe-right:${tokens.right}px!important;--safe-bottom:${tokens.bottom}px!important;--safe-left:${tokens.left}px!important}`
  const add = () => { const s = document.createElement('style'); s.setAttribute('data-safe-area-emulation', ''); s.textContent = css; document.head.appendChild(s) }
  if (document.head) add(); else document.addEventListener('DOMContentLoaded', add, { once: true })
}

async function run(engine, orientation, ids) {
  const { viewport, insets } = ORIENTATIONS[orientation]
  const tag = `${engine} ${orientation} ${viewport.width}×${viewport.height}`
  const exe = engine === 'chromium' ? process.env.CHROMIUM_PATH : process.env.WEBKIT_PATH
  const browser = await pw[engine].launch(exe ? { executablePath: exe } : {})
  const opts = { viewport, hasTouch: true, isMobile: engine === 'chromium', deviceScaleFactor: 1, locale: 'en-GB', timezoneId: 'UTC', colorScheme: 'light' }
  let checked = 0
  const fail = async (p, screen, overlay, msg) => {
    failures.push(`${screen}${overlay ? ' › ' + overlay : ''} [${tag}]: ${msg}`)
    await p.screenshot({ path: `${outDir}/${engine}-${orientation}-${screen}${overlay ? '-' + overlay : ''}.png`.replace(/[^\w./-]/g, '_') }).catch(() => {})
  }
  const shot = (p, screen, overlay) => SHOTS_ALL && p.screenshot({ path: `${outDir}/ok-${engine}-${orientation}-${screen}${overlay ? '-' + overlay : ''}.png` }).catch(() => {})
  const pageIn = async (ctx) => {
    const p = await ctx.newPage()
    p.on('dialog', (d) => d.dismiss())
    if (engine === 'chromium') await (await ctx.newCDPSession(p)).send('Emulation.setSafeAreaInsetsOverride', { insets })
    return p
  }
  const measure = async (p, screen, overlay) => {
    for (const m of await p.evaluate(insetOverlaps, [null, insets])) await fail(p, screen, overlay, m)
    await shot(p, screen, overlay)
  }
  try {
    const contexts = []
    for (const storageState of [undefined, ids.storageState]) {
      const c = await browser.newContext({ ...opts, ...(storageState ? { storageState } : {}) })
      await c.clock.setFixedTime(NOW)
      await c.addInitScript(standalone, engine === 'chromium' ? null : insets)
      await c.route('**/api/v1/calendar-feeds/events?*', (route) => route.fulfill({ json: calendarEvents(NOW) }))
      contexts.push(c)
    }
    const [anonCtx, ctx] = contexts
    const page = await pageIn(ctx)
    await page.goto(base + '/inbox')
    await page.locator('[data-task-id]').first().waitFor({ timeout: 30000 })
    for (const s of [...screens(ids, base), ...EXTRA]) {
      if (ONLY && !ONLY.has(s.name)) continue
      if (s.engines && !s.engines.includes(engine)) continue
      if (s.widths && !s.widths.includes(viewport.width)) continue
      const p = s.anon ? await pageIn(anonCtx) : page
      const load = async () => {
        await p.goto(base + s.path)
        await s.ready(p)
        if (s.layout) { await chooseLayout(p, s.layout); await p.waitForTimeout(300) }
        await p.waitForTimeout(250)
      }
      try {
        await load().catch(load).catch(load)
      } catch (e) {
        await fail(p, s.name, null, `screen did not load: ${e.message.split('\n')[0]}`)
        if (s.anon) await p.close()
        continue
      }
      checked++
      await measure(p, s.name, null)
      // The phone's drawer and the sheets, panels and dialogs opened from this screen.
      for (const o of (s.overlays ?? []).filter((n) => !SKIP.has(n) && !SKIP.has(`${n}@${orientation}`))) {
        const checkOne = async () => {
          await load()
          const res = await OVERLAYS[o](p, { width: viewport.width })
          if (!res) return
          await res.overlay.waitFor({ state: 'visible', timeout: 5000 })
          await res.overlay.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).filter((a) => a.effect?.getComputedTiming().endTime !== Infinity).map((a) => a.finished.catch(() => {}))))
          await p.waitForTimeout(250)
          checked++
          await measure(p, s.name, o)
          // With the on-screen keyboard open (portrait): it lifts a phone sheet by --vv-bottom
          // (watchVisualViewport), which must not push the sheet's title and Close button under
          // the island. Emulated by setting that variable, as the app does when the keyboard opens.
          if (orientation === 'portrait' && await res.overlay.evaluate((el) => el.matches('[data-overlay="sheet"]'))) {
            await p.evaluate(() => document.documentElement.style.setProperty('--vv-bottom', '336px'))
            await p.waitForTimeout(150)
            const top = await res.overlay.evaluate((el) => el.querySelector('[data-overlay-close]')?.getBoundingClientRect().top ?? null)
            if (top !== null && top < insets.top) await fail(p, s.name, `${o} (keyboard open)`, `the Close button is under the top safe area (its top at ${Math.round(top)} px; the strip is ${insets.top} px)`)
            await shot(p, s.name, `${o}-keyboard`)
            await p.evaluate(() => document.documentElement.style.removeProperty('--vv-bottom'))
          }
          if (res.after) await res.after().catch(() => {})
        }
        // An overlay that does not open in time gets one more try (a loaded machine), as in the layout check.
        try {
          await checkOne()
        } catch {
          await p.keyboard.press('Escape').catch(() => {})
          try {
            await checkOne()
          } catch (e) {
            await fail(p, s.name, o, `could not be checked: ${e.message.split('\n')[0]}`)
          }
        }
        await p.keyboard.press('Escape').catch(() => {})
        await p.keyboard.press('Escape').catch(() => {})
      }
      if (s.layout) await chooseLayout(p, s.layout === 'Columns' ? 'Columns' : 'List').catch(() => {})
      if (s.anon) await p.close()
    }
  } catch (e) {
    failures.push(`[${tag}] aborted: ${e.message.split('\n')[0]}`)
  } finally {
    await browser.close()
  }
  log(`  ${tag}: ${checked} screens and overlays checked`)
}

log('· seeding', base)
const ids = { ...await seedAccount({ base, pw, now: NOW }), date: LAYOUT_DATE }
const runs = []
for (const e of ENGINES) for (const o of WANT) runs.push(run(e, o, ids))
await Promise.all(runs)
ids.llm?.close()
writeFileSync(`${outDir}/failures.txt`, failures.join('\n') + '\n')
if (failures.length) {
  log(`\n✗ ${failures.length} controls in a safe area (screenshots in ${outDir}/):`)
  for (const f of failures) log('  -', f)
  process.exit(1)
}
log('\nSAFE AREA OK')
process.exit(0)
