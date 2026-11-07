// Safe-area check (GitHub issue 973): opens every screen and overlay of the layout
// check (scripts/ux-audit/layout-screens.mjs) as the installed app on a phone with a
// Dynamic Island, in portrait (390 × 844, insets 59 px at the top and 34 px at the
// bottom) and in landscape (844 × 390, 59 px left and right, 21 px at the bottom),
// and fails when a control that can be tapped sits in one of those strips
// (insetOverlaps in scripts/ux-audit/measure.mjs): under the island, the status bar,
// the home indicator or a rounded side.
//
// The top edge (GitHub issue 999, topEdge in measure.mjs): with a top inset, every
// screen keeps an opaque fixed backdrop over the status bar (without one, Safari blurs
// whatever is under it) and draws no text in that strip at rest. It is checked on
// each screen as it loads, after each of its overlays closes again, and after a cold
// start (COLD_START, default inbox,project,today): the screen loads with no insets, as
// iOS sometimes reports them on launch, and the insets arrive once it is drawn.
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
import { insetOverlaps, topEdge } from './ux-audit/measure.mjs'
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
const COLD_START = new Set((process.env.COLD_START ?? 'inbox,project,today').split(',').filter(Boolean))
const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 }
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
  const cdp = new Map()
  const pageIn = async (ctx, start = insets) => {
    const p = await ctx.newPage()
    p.on('dialog', (d) => d.dismiss())
    if (engine === 'chromium') {
      cdp.set(p, await ctx.newCDPSession(p))
      await cdp.get(p).send('Emulation.setSafeAreaInsetsOverride', { insets: start })
    }
    return p
  }
  // The insets changing under a loaded page, as iOS reports them late on a cold start.
  const setInsets = async (p, v) => {
    if (engine === 'chromium') return cdp.get(p).send('Emulation.setSafeAreaInsetsOverride', { insets: v })
    await p.evaluate((t) => {
      const s = document.querySelector('style[data-safe-area-emulation]')
      if (s) s.textContent = `:root{--safe-top:${t.top}px!important;--safe-right:${t.right}px!important;--safe-bottom:${t.bottom}px!important;--safe-left:${t.left}px!important}`
    }, v)
  }
  const measure = async (p, screen, overlay) => {
    for (const m of await p.evaluate(insetOverlaps, [null, insets])) await fail(p, screen, overlay, m)
    await shot(p, screen, overlay)
  }
  const measureTop = async (p, screen, overlay) => {
    for (const m of await p.evaluate(topEdge, [insets])) await fail(p, screen, overlay, m)
  }
  const newContext = async (storageState, tokens) => {
    const c = await browser.newContext({ ...opts, ...(storageState ? { storageState } : {}) })
    await c.clock.setFixedTime(NOW)
    await c.addInitScript(standalone, engine === 'chromium' ? null : tokens)
    await c.route('**/api/v1/calendar-feeds/events?*', (route) => route.fulfill({ json: calendarEvents(NOW) }))
    return c
  }
  try {
    const contexts = []
    for (const storageState of [undefined, ids.storageState]) contexts.push(await newContext(storageState, insets))
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
      await measureTop(p, s.name, null)
      // A cold start: a fresh app loads this screen with no insets, which arrive once it is drawn.
      if (insets.top > 0 && COLD_START.has(s.name) && !s.anon) {
        const coldCtx = await newContext(ids.storageState, NO_INSETS)
        try {
          const cold = await pageIn(coldCtx, NO_INSETS)
          await cold.goto(base + s.path)
          await s.ready(cold)
          await cold.waitForTimeout(250)
          await setInsets(cold, insets)
          await cold.waitForTimeout(250)
          checked++
          await measure(cold, s.name, 'cold start')
          await measureTop(cold, s.name, 'cold start')
        } catch (e) {
          await fail(p, s.name, 'cold start', `could not be checked: ${e.message.split('\n')[0]}`)
        } finally {
          await coldCtx.close()
        }
      }
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
        // Closed again, the screen is as it was at rest: nothing of it under the status bar.
        if (insets.top > 0) {
          await p.waitForTimeout(400)
          await measureTop(p, s.name, `${o} (closed)`)
        }
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
