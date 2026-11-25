// Layout check (OpenSpec change `mobile-layout`): opens every screen and every
// overlay at phone and tablet widths, in light and dark, in Chromium and WebKit,
// and fails when
//   - a page scrolls sideways outside a designated scroll region (`data-scroll-x`),
//   - more than three regions scroll vertically outside designated ones (`data-scroll-y`),
//   - an overlay or its close control is outside the viewport or not clickable,
//   - content of an overlay that asks for it (the start guide, issue #731) sticks out of
//     its panel or squeezes a sentence to a word a line beside its buttons,
//   - an overlay does not close with Escape, with its close button (sheets and
//     dialogs) or with a tap outside (popovers),
//   - a control on the touch screen is smaller than 44 × 44 px or only appears on hover,
//   - a text field (input, textarea, select, editable area) has text under 16 px on the
//     touch screen, which makes Safari on iOS zoom in on focus (issue #724),
//   - the page does not end the overscroll chain or turns zoom off, a control or
//     navigation can be text-selected, or a field, editable area or comment cannot
//     (shell-touch, GitHub issue 1338), or a tab of the tab bar is under 48 px tall
//     (touch-pressed-states, GitHub issue 1349),
//   - pressing a task row's completion circle shows no pressed colour by 100 ms, the
//     engine does not hold that colour back 60 ms, or the row is pressed with it
//     (press-feedback-delay),
//   - on the touch screen a hover look appears under a resting pointer, or a tap on a
//     field or a switch leaves a focus ring while Tab after it draws none (touch-input-mode),
//   - a task row held for 300 ms does not rise, does not settle after an early release,
//     or rises under reduced motion (row-lift-overscroll),
//   - an option of a segmented control or a day's name in a Day or Week header is cut,
//   - in Day and Week, the calendar's sticky header takes more than half of the calendar
//     or the now line paints over it (GitHub issue 775),
//   - the floating add button covers the last task row or a form field (at the top or
//     the end of a page),
//   - scrolled to its end, a screen or a scroller inside it (the calendar's grid, a board
//     column) leaves a control under the floating add button, or a screen without the
//     button keeps empty room for it (phone-fab-scroll-room, GitHub issue 1382),
//   - on the settings pages that ask for it, two controls overlap or a control touches a
//     row divider (themes-layout-template),
//   - on a task's page, the conversation's tab bar paints over the open comment composer
//     pinned to the bottom (GitHub issue 1939),
//   - any screen or overlay has a serious or critical axe-core issue (colour contrast,
//     names, labels, roles), in light and dark (release 0.2.0; first added for the
//     Help view by user-documentation),
//   - help does not open offline, or text typed in the share dialog is lost when the
//     help panel opens and closes over it.
// Every failure names screen, overlay, viewport, theme and engine, and saves a
// screenshot into the report directory.
//
//   node scripts/e2e-layout.mjs [report-dir]        (default: layout-report)
//
// Run it against a FRESH data directory (it creates the owner account and seeds
// data through the API). Env: OPENTODO_URL (default http://127.0.0.1:8080),
// ENGINES (default chromium,webkit), WIDTHS (default 360,390,768), THEMES
// (default light,dark), ONLY (comma-separated screen names), CONCURRENCY
// (default 3), SHOTS=all (also save a screenshot of every screen and overlay),
// CHROMIUM_PATH / WEBKIT_PATH (optional executables), OPENTODO_LANG (an interface
// language such as de: the synced preference is written before capturing, and
// signed-out screens start in it too; OpenSpec change app-localization 11.1),
// LAYOUT_DATE (default 2026-11-01: the browsers' clock and the seeded dates),
// SHARD (i/n: only every n-th engine × width × theme combination, from the i-th, so
// n jobs side by side check them all; CI's pull request legs).
// PHONE_UI=1 (the device's "New phone screens" switch is on, OpenSpec change
// phone-ui-trial: Today and the task page are then the phone UI's below 768 px; run it
// and every screen of the shell has the phone header, phone-all-screens; a run fails when one has neither).
//
// The browsers' clock is fixed at 09:00 UTC on LAYOUT_DATE and the account is seeded
// around that day, so the check sees the same calendars whatever day it runs: which
// month and weekday "today" is changed the Month grid (a Sunday today put its load line
// in the last column) and a run passed or failed by date. The default is a Sunday in a
// long-named month with six week rows.
const pw = await import('playwright').catch(async () => {
  const { createRequire } = await import('node:module')
  const { execSync } = await import('node:child_process')
  return createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')
})
import { mkdirSync, writeFileSync } from 'node:fs'
import { MAX_SCROLLERS, addButtonCovers, addButtonRoom, axeProblems, calendarGridRoom, crowdedControls, crumbOverlap, cutLabels, missingMainScroller, overlayContentFit, pageOverflow, rowCheckReach, rowMisalignment, settled, smallFields, smallTargets, tabRowOverflow, tintDrift, touchFeel, verticalScrollers } from './ux-audit/measure.mjs'
import { calendarEvents, seed as seedAccount } from './ux-audit/seed.mjs'
import { ANY_LANG_OVERLAYS, OVERLAYS, chooseLayout, closes, openScreen, screens } from './ux-audit/layout-screens.mjs'

const base = process.env.OPENTODO_URL ?? 'http://127.0.0.1:8080'
const outDir = process.argv[2] ?? 'layout-report'
const ENGINES = (process.env.ENGINES ?? 'chromium,webkit').split(',').filter(Boolean)
// Tablets (tablet-layouts D4): iPad mini portrait, iPad landscape at 1024 and 1180 px.
const HEIGHTS = { 320: 640, 360: 740, 390: 844, 744: 1133, 768: 1024, 1024: 768, 1180: 820, 1280: 900 }
const WIDTHS = (process.env.WIDTHS ?? '360,390,768').split(',').map(Number)
const THEMES = (process.env.THEMES ?? 'light,dark').split(',')
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 3)
const SHOTS_ALL = process.env.SHOTS === 'all'
const LANG = process.env.OPENTODO_LANG ?? ''
// The phone UI's switch, as the app keeps it on a device (web/src/phone/prefs.ts).
const PHONE_UI = process.env.PHONE_UI === '1'
/** Screens outside the app's shell (Display mode, the share target, an invitation): no page header to draw. */
const PHONE_UI_OUTSIDE = /^(display-|share-|project-invite)/
const LAYOUT_DATE = process.env.LAYOUT_DATE ?? '2026-11-01'
const [SHARD_AT, SHARD_OF] = (process.env.SHARD || '1/1').split('/').map(Number)
if (!(SHARD_OF >= 1 && SHARD_AT >= 1 && SHARD_AT <= SHARD_OF)) throw new Error(`SHARD must be i/n with 1 <= i <= n, not ${process.env.SHARD}`)
const NOW = new Date(`${LAYOUT_DATE}T09:00:00Z`).getTime()
if (!/^\d{4}-\d{2}-\d{2}$/.test(LAYOUT_DATE) || Number.isNaN(NOW)) throw new Error(`LAYOUT_DATE ${LAYOUT_DATE}: expected YYYY-MM-DD`)
// Screens wait on English headings and overlays are opened by English names: in another
// language (the German leg, ux-audit-three-widths F4) every screen is checked once a
// heading, a task row or an alert shows, without its overlays or layout switches.
const OTHER_LANG = !!LANG && LANG !== 'en'
// The first *visible* match: a hidden or zero-width candidate earlier in the page (a
// phone bar title squeezed by long action labels, F7 of the test audit) never shows.
const anyReady = (p) => p.locator('main :is(h1, [data-page-body], [data-task-id]), [data-screen], h1, form').filter({ visible: true }).first().waitFor({ timeout: 15000 })
const MIN_TARGET = 44
// Safari on iOS zooms in on a focused field with smaller text (issue #724).
const MIN_FIELD_TEXT = 16
mkdirSync(outDir, { recursive: true })

const failures = []
const log = (...a) => console.log(...a)



// Seed, screens, overlay openers and page measurements live in scripts/ux-audit/
// (shared with the interface audit tour, ux-audit-three-widths D2).

// Overlay geometry: inside the viewport, close control inside and hit-testable.
function overlayGeometry(el) {
  const vw = window.innerWidth, vh = window.innerHeight
  const r = el.getBoundingClientRect()
  const out = { problems: [], hasClose: false }
  // A scrolling dialog overlay may be taller than the screen: then the panel scrolls
  // inside the fixed overlay; only the horizontal extent and the top must fit.
  const scrolls = (() => { for (let a = el; a; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.position === 'fixed') return /(auto|scroll)/.test(cs.overflowY) && a.scrollHeight > a.clientHeight; } return false })()
  if (r.left < -1 || r.right > vw + 1) out.problems.push(`overlay is outside the viewport horizontally (left ${Math.round(r.left)}, right ${Math.round(r.right)}, viewport ${vw})`)
  if (r.top < -1 || (!scrolls && r.bottom > vh + 1)) out.problems.push(`overlay is outside the viewport vertically (top ${Math.round(r.top)}, bottom ${Math.round(r.bottom)}, viewport ${vh})`)
  const close = el.querySelector('[data-overlay-close]') ?? el.querySelector('button[aria-label="Close"]')
  if (close) {
    out.hasClose = true
    const c = close.getBoundingClientRect()
    if (c.left < 0 || c.right > vw || c.top < 0 || c.bottom > vh) out.problems.push(`close control is outside the viewport (${Math.round(c.left)},${Math.round(c.top)} ${Math.round(c.width)}×${Math.round(c.height)})`)
    else {
      const hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2)
      if (!hit || !close.contains(hit)) out.problems.push(`close control is covered by ${hit ? hit.tagName.toLowerCase() + (hit.getAttribute('aria-label') ? ` "${hit.getAttribute('aria-label')}"` : '') : 'nothing'}`)
    }
  }
  return out
}

// ------------------------------------------------------------------ runner
// WebKit sometimes loses its IndexedDB server process under load (four browsers at once in
// CI): the app's local database is gone, the session reads as signed out, and every later
// screen of that combination fails. That is the engine, not the app, so such a combination
// is run once more from a fresh browser; a second loss is reported as usual. The loss
// also shows as a screen that never loads while /auth/status says signed out (the
// retry below appends "the session was signed out"), so that counts too.
const ENGINE_DB_LOST = /Connection to Indexed Database server lost|unknown transient reason|the session was signed out/i

// A combination that stops making progress (WebKit's web process can stall inside an
// evaluate or a close under load, which no Playwright timeout covers) is stopped after
// COMBO_TIMEOUT_MS and reported with the step it was on, instead of holding the job
// until CI cancels it with no report. WebKit gets one more run, as above.
const COMBO_TIMEOUT_MS = Number(process.env.COMBO_TIMEOUT_MS ?? 8 * 60 * 1000)

async function runCombo(engine, width, theme, ids, attempt = 1) {
  const mine = []
  const run = { browser: null, step: 'launching the browser', crashed: null }
  let timer
  const stalled = new Promise((resolve) => { timer = setTimeout(() => resolve('stalled'), COMBO_TIMEOUT_MS) })
  const outcome = await Promise.race([runComboOnce(engine, width, theme, ids, mine, run), stalled])
  clearTimeout(timer)
  // A page whose web process crashed (Playwright's Linux WebKit is built with libstdc++
  // assertions) answers nothing again, and a goto on it never returns: the browser is
  // closed at the crash and the step is reported, instead of a stall. WebKit gets one
  // more run, as above.
  if (run.crashed) {
    const tag = `${engine} ${width}px ${theme}`
    if (engine === 'webkit' && attempt === 1) {
      log(`  ${tag}: the page crashed at ${run.crashed}; running this combination again`)
      return runCombo(engine, width, theme, ids, 2)
    }
    failures.push(`[${tag}] the page crashed at ${run.crashed}`)
    return
  }
  if (outcome === 'stalled') {
    const tag = `${engine} ${width}px ${theme}`
    run.browser?.close().catch(() => {})
    if (engine === 'webkit' && attempt === 1) {
      log(`  ${tag}: stalled at ${run.step} for ${COMBO_TIMEOUT_MS / 60000} min; running this combination again`)
      return runCombo(engine, width, theme, ids, 2)
    }
    failures.push(`[${tag}] stalled for ${COMBO_TIMEOUT_MS / 60000} min at ${run.step}`)
    return
  }
  if (outcome && attempt === 1) {
    log(`  ${engine} ${width}px ${theme}: WebKit lost its IndexedDB server; running this combination again`)
    return runCombo(engine, width, theme, ids, 2)
  }
  failures.push(...mine)
}

async function runComboOnce(engine, width, theme, ids, failures, run) {
  const tag = `${engine} ${width}px ${theme}`
  const launcher = pw[engine]
  const exe = engine === 'chromium' ? process.env.CHROMIUM_PATH : engine === 'webkit' ? process.env.WEBKIT_PATH : undefined
  const browser = await launcher.launch(exe ? { executablePath: exe } : {})
  run.browser = browser
  run.step = 'signing in'
  // bypassCSP lets the check inject axe-core into the app's strict Content-Security-Policy.
  const ctxOpts = { viewport: { width, height: HEIGHTS[width] ?? 900 }, colorScheme: theme, hasTouch: true, isMobile: true, deviceScaleFactor: 1, locale: 'en-GB', timezoneId: 'UTC', bypassCSP: true }
  const fail = async (page, screen, overlay, msg) => {
    const name = `${engine}-${width}-${theme}-${screen}${overlay ? '-' + overlay : ''}`.replace(/[^a-z0-9-]/gi, '_')
    failures.push(`${screen}${overlay ? ' › ' + overlay : ''} [${tag}]: ${msg}`)
    if (page) await page.screenshot({ path: `${outDir}/${name}.png` }).catch(() => {})
  }
  const shot = async (page, screen, overlay) => {
    if (!SHOTS_ALL) return
    await page.screenshot({ path: `${outDir}/ok-${engine}-${width}-${theme}-${screen}${overlay ? '-' + overlay : ''}.png` }).catch(() => {})
  }
  let checked = 0
  try {
    const anonCtx = await browser.newContext(ctxOpts)
    const ctx = await browser.newContext({ ...ctxOpts, storageState: ids.storageState })
    // First paint in the chosen language (the device mirror the app keeps), also signed out.
    for (const c of [anonCtx, ctx]) await c.clock.setFixedTime(NOW)
    // A subscribed calendar's events in every calendar view (calendar-events-all-views):
    // answered here, since a real feed needs an outbound fetch.
    const events = calendarEvents(NOW)
    await ctx.route('**/api/v1/calendar-feeds/events?*', (route) => route.fulfill({ json: events }))
    if (LANG) for (const c of [anonCtx, ctx]) await c.addInitScript((code) => { try { localStorage.setItem('opentodo.lang', code) } catch { /* storage blocked */ } }, LANG)
    if (PHONE_UI) await ctx.addInitScript(() => { try { localStorage.setItem('opentodo.phoneUi', '1') } catch { /* storage blocked */ } })
    const page = await ctx.newPage()
    page.on('dialog', (d) => d.dismiss())
    page.on('crash', () => { run.crashed ??= run.step; browser.close().catch(() => {}) })
    const pageErrors = []
    // WebKit reports fetches cut off by a navigation as errors; those are not app bugs.
    page.on('pageerror', (e) => { if (!/access control checks|Load failed|The network connection was lost|cancelled/i.test(e.message)) pageErrors.push(e.message) })
    await page.goto(base + '/inbox')
    await page.locator('[data-task-id]').first().waitFor({ timeout: 30000 })
    // The touch probes (mobile-native-feel): each on a page of its own, opened on the
    // Inbox and closed after, so a press, a hold or a tap one leaves behind cannot change
    // what the next one reads.
    for (const [step, screen, label, probe] of [
      ['press feedback', 'inbox', 'press', (q) => pressFeedback(q)],
      ['row lift', 'inbox', 'hold', (q) => rowLift(q)],
      ['touch input', 'settings', 'touch input', (q) => touchInput(q, base)],
    ]) {
      run.step = step
      const q = await ctx.newPage()
      try {
        await q.goto(base + '/inbox')
        await q.locator('[data-task-id]').first().waitFor({ timeout: 30000 })
        for (const m of await probe(q)) await fail(q, screen, null, `${label}: ${m}`)
      } finally {
        await q.close()
      }
    }
    for (const s of screens(ids, base)) {
      if (ONLY && !ONLY.has(s.name)) continue
      if (s.engines && !s.engines.includes(engine)) continue
      if (s.widths && !s.widths.includes(width)) continue
      if (OTHER_LANG && s.layout) continue
      run.step = `screen ${s.name}`
      const p = s.anon ? await anonCtx.newPage() : page
      // A screen that does not load is retried once (a slow CI machine); the second
      // failure is reported with whether the session was still valid.
      const visit = () => load().catch(async () => load().catch(async (e) => {
        const st = s.anon ? null : await ctx.request.get(base + '/api/v1/auth/status').then((r) => r.json()).catch(() => null)
        throw new Error(`${e.message.split('\n')[0]}${st && !st.authenticated ? ' (the session was signed out)' : ''}`)
      }))
      const load = async () => {
        await openScreen(p, base + s.path)
        await (OTHER_LANG ? anyReady : s.ready)(p)
        if (s.layout) {
          await chooseLayout(p, s.layout)
          await p.waitForTimeout(300)
        }
        await p.waitForTimeout(250)
        // With the switch on, a screen that has a phone view must be showing it: a run that
        // quietly checked the present screens would pass and prove nothing (phone-ui-trial).
        // Waited for, not looked up once: a screen loaded on demand (the calendar) mounts after its `ready` has held.
        if (PHONE_UI && width < 768 && !s.anon && !PHONE_UI_OUTSIDE.test(s.name)) {
          await p.locator('[data-phone-screen], [data-phone-header]').first().waitFor({ state: 'attached', timeout: 20000 })
            .catch(() => { throw new Error('the phone UI is on but the screen has neither a phone screen nor the phone header') })
        }
      }
      try {
        await visit()
      } catch (e) {
        await fail(p, s.name, null, `screen did not load: ${e.message.split('\n')[0]}`)
        continue
      }
      checked++
      for (const m of await p.evaluate(pageOverflow)) await fail(p, s.name, null, m)
      const scrollers = await p.evaluate(verticalScrollers)
      if (scrollers.length > MAX_SCROLLERS) await fail(p, s.name, null, `${scrollers.length} vertical scroll regions (at most ${MAX_SCROLLERS}): ${scrollers.join(', ')}`)
      for (const m of await p.evaluate(tabRowOverflow)) await fail(p, s.name, null, m)
      for (const m of await p.evaluate(missingMainScroller)) await fail(p, s.name, null, m)
      for (const m of await p.evaluate(cutLabels)) await fail(p, s.name, null, m)
      for (const m of await p.evaluate(crumbOverlap)) await fail(p, s.name, null, m)
      for (const m of await p.evaluate(smallTargets, [null, MIN_TARGET])) await fail(p, s.name, null, `touch target: ${m}`)
      for (const m of await p.evaluate(smallFields, [null, MIN_FIELD_TEXT])) await fail(p, s.name, null, `text field: ${m}`)
      for (const m of await p.evaluate(touchFeel, [null])) await fail(p, s.name, null, `touch: ${m}`)
      for (const m of await p.evaluate(rowMisalignment)) await fail(p, s.name, null, m)
      for (const m of await p.evaluate(rowCheckReach)) await fail(p, s.name, null, m)
      for (const m of await p.evaluate(addButtonCovers)) await fail(p, s.name, null, m)
      for (const m of await p.evaluate(addButtonRoom)) await fail(p, s.name, null, m)
      // Crowded controls on the settings pages that ask for it (themes-layout-template).
      if (s.gridRoom) for (const m of await p.evaluate(calendarGridRoom)) await fail(p, s.name, null, m)
      if (s.crowded) for (const m of await p.evaluate(crowdedControls, ['main', 4])) await fail(p, s.name, null, `crowded: ${m}`)
      // Accessibility of the whole screen (axe-core, serious and critical issues).
      for (const m of await axeProblems(p)) await fail(p, s.name, null, m)
      if (s.offline && engine === 'chromium' && !OTHER_LANG) {
        // Help ships with the app: offline, another guide still opens from the precache.
        await ctx.setOffline(true)
        try {
          await p.goto(base + s.offline)
          await p.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 10000 })
          await p.getByLabel('Search help').fill('board')
          await p.locator('[data-help-result]').first().waitFor({ timeout: 5000 })
        } catch (e) {
          await fail(p, s.name, null, `help does not work offline: ${e.message.split('\n')[0]}`)
        } finally {
          await ctx.setOffline(false)
        }
      }
      await shot(p, s.name)
      // In another language only the overlays opened by data attributes (the start guide).
      for (const o of (s.overlays ?? []).filter((n) => (!OTHER_LANG || ANY_LANG_OVERLAYS.has(n)))) {
        run.step = `screen ${s.name} › ${o}`
        const checkOne = async () => {
          await visit()
          const res = await OVERLAYS[o](p, { width })
          if (!res) return
          checked++
          // Accessibility of the overlay itself (the screen behind it was checked above).
          await res.overlay.waitFor({ state: 'visible', timeout: 5000 })
          await p.waitForTimeout(250)
          await res.overlay.evaluate((el) => el.setAttribute('data-axe-target', ''))
          for (const m of await axeProblems(p, '[data-axe-target]')) await fail(p, s.name, o, m)
          await res.overlay.evaluate((el) => el.removeAttribute('data-axe-target')).catch(() => {})
          await checkOverlay(p, s.name, o, res, fail, shot)
          if (res.after) await res.after().catch(() => {})
        }
        // An overlay that does not open in time gets one more try, like a screen that does
        // not load (WebKit on a loaded runner); the second failure is the one reported.
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
      }
      if (s.layout) {
        await chooseLayout(p, s.layout === 'Columns' ? 'Columns' : 'List').catch(() => {})
      }
      if (s.anon) await p.close()
    }
    // page-transitions 2.2: Inbox → task page → Back slides with a direction (Chromium, a phone;
    // from 600 px a task opens as a sheet over the list, tablet-layouts D2).
    if (engine === 'chromium' && width < 600 && !ONLY && !OTHER_LANG) {
      run.step = 'page transitions'
      for (const m of await pageTransitions(page, base)) await fail(page, 'page-transitions', null, m)
    }
    // tablet-layouts 2.3: an open task and the list survive turning a tablet and split view (Chromium, 1024 px).
    if (engine === 'chromium' && width === 1024 && !ONLY && !OTHER_LANG) {
      run.step = 'tablet resize'
      for (const m of await tabletResize(page, base)) await fail(page, 'tablet-resize', null, m)
    }
    // swipe-back-follows 2.1: a touch drag from the edge of a task's page (Chromium, 390 and 768 px).
    if (engine === 'chromium' && (width === 390 || width === 768) && !ONLY && !OTHER_LANG) {
      run.step = 'swipe back'
      for (const m of await swipeBack(page, base, width)) await fail(page, 'swipe-back', null, m)
    }
    // GitHub issue 1939: the open composer, pinned over the thread, covers the tab bar scrolling under it (Chromium, a phone).
    if (engine === 'chromium' && width === 390 && !ONLY && !OTHER_LANG) {
      run.step = 'pinned composer'
      for (const m of await pinnedComposer(page, base)) await fail(page, 'pinned-composer', null, m)
    }
    for (const e of pageErrors) failures.push(`page error [${tag}]: ${e}`)
  } catch (e) {
    failures.push(`[${tag}] aborted: ${e.message.split('\n')[0]}`)
  } finally {
    run.step = 'closing the browser'
    await browser.close()
  }
  log(`  ${tag}: ${checked} screens and overlays checked`)
  return engine === 'webkit' && failures.some((f) => ENGINE_DB_LOST.test(f))
}


// page-transitions D4: opens a task's page from the Inbox and goes back, recording each
// view transition the route change starts (its direction, and the opacity the old page's
// animation ends at) and awaiting it, so the check stays deterministic; then the same with
// reduced motion, where no page transition may run. Returns the problems.
async function pageTransitions(p, base) {
  const problems = []
  const record = () => p.evaluate(() => {
    const w = window
    w.__navs = []
    const start = document.startViewTransition?.bind(document)
    if (!start || w.__navWrapped) return
    w.__navWrapped = true
    document.startViewTransition = (update) => {
      const vt = start(update)
      const dir = document.documentElement.dataset.nav
      if (!dir) return vt
      const rec = { dir, oldEnd: null, done: false }
      w.__navs.push(rec)
      vt.ready.then(() => {
        const old = document.getAnimations().find((a) => a.effect?.pseudoElement === '::view-transition-old(page)')
        const frames = old?.effect?.getKeyframes() ?? []
        rec.oldEnd = frames.length ? Number(frames[frames.length - 1].opacity ?? 1) : null
      }).catch(() => {})
      vt.finished.finally(() => { rec.done = true })
      return vt
    }
  })
  const settledNavs = async () => {
    await p.waitForFunction(() => (window.__navs ?? []).every((r) => r.done) && !document.documentElement.dataset.nav, null, { timeout: 5000 })
    return p.evaluate(() => window.__navs)
  }
  const round = async (reduced) => {
    await p.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' })
    await openScreen(p, base + '/inbox')
    await p.locator('[data-task-id]').filter({ hasText: 'Undated inbox task' }).first().waitFor()
    // The transitions load after the first paint (the page-transitions spec).
    await p.waitForTimeout(300)
    await record()
    // A tap: a change made from the keyboard happens at once (the page-transitions spec).
    await p.locator('[data-task-id]').filter({ hasText: 'Undated inbox task' }).first().locator('[data-row-open]').click()
    await p.locator('[data-task-page]').first().waitFor({ timeout: 10000 })
    const forward = await settledNavs()
    await p.evaluate(() => { window.__navs = [] })
    await p.goBack()
    await p.locator('[data-task-id]').filter({ hasText: 'Undated inbox task' }).first().waitFor({ timeout: 10000 })
    const back = await settledNavs()
    return { forward, back }
  }
  try {
    const moving = await round(false)
    const f = moving.forward
    const b = moving.back
    if (f.length !== 1 || f[0].dir !== 'forward' || f[0].oldEnd !== 0) problems.push(`opening a task's page: expected one forward transition whose old page ends at opacity 0, got ${JSON.stringify(f)}`)
    if (b.length !== 1 || b[0].dir !== 'back' || b[0].oldEnd !== 0) problems.push(`going back: expected one back transition whose old page ends at opacity 0, got ${JSON.stringify(b)}`)
    const still = await round(true)
    if (still.forward.length || still.back.length) problems.push(`with reduced motion a page transition ran: ${JSON.stringify(still)}`)
  } catch (e) {
    problems.push(`could not be checked: ${e.message.split('\n')[0]}`)
  } finally {
    await p.emulateMedia({ reducedMotion: 'no-preference' }).catch(() => {})
  }
  return problems
}

// tablet-layouts D3: a task opened from the Inbox stays open while the window changes
// size (an iPad turned, a split view, Stage Manager): docked from 900 px, a sheet over
// the list below, the list still there and its scroll position kept. Returns the problems.
async function tabletResize(p, base) {
  const problems = []
  const start = p.viewportSize()
  try {
    await openScreen(p, base + '/inbox')
    const row = p.locator('[data-task-id]').filter({ hasText: 'Sand the boards' }).first()
    await row.waitFor()
    await row.locator('[data-row-open]').click()
    const id = await row.getAttribute('data-task-id')
    await p.locator(`[data-detail-for="${id}"]`).first().waitFor({ timeout: 10000 })
    const scroll = await p.evaluate(() => document.getElementById('content')?.scrollTop ?? 0)
    for (const [width, height] of [[1180, 820], [820, 1180], [678, 900], [1024, 768]]) {
      await p.setViewportSize({ width, height })
      await p.waitForTimeout(500)
      const s = await p.evaluate((id) => ({
        task: new URLSearchParams(location.search).get('task'), page: location.pathname,
        detail: !!document.querySelector(`[data-detail-for="${id}"]`), list: !!document.querySelector('[data-list-page]'),
        scroll: document.getElementById('content')?.scrollTop ?? 0,
      }), id)
      if (s.task !== id || !s.detail) problems.push(`at ${width} px the open task closed (${s.page}?task=${s.task})`)
      if (!s.list) problems.push(`at ${width} px the list left the screen`)
      if (Math.abs(s.scroll - scroll) > 1) problems.push(`at ${width} px the list scrolled from ${scroll} to ${s.scroll}`)
    }
  } catch (err) {
    problems.push(`could not be checked: ${err.message.split('\n')[0]}`)
  } finally {
    await p.setViewportSize(start)
  }
  return problems
}

// GitHub issue 1939: on a task's page with the comment composer open, the page scrolled
// back until the conversation's tab bar is under the pinned composer shows the composer
// there, not the tab bar painted over it. Returns the problems.
async function pinnedComposer(p, base) {
  const problems = []
  try {
    await openScreen(p, base + '/inbox')
    const row = p.locator('[data-task-id]').filter({ hasText: 'Undated inbox task' }).first()
    await row.waitFor()
    await row.locator('[data-row-open]').press('Enter')
    await p.locator('[data-task-page]').first().waitFor({ timeout: 10000 })
    await p.locator('[data-panel-footer] [contenteditable], [data-panel-footer] textarea, [data-panel-footer] button').first().click()
    await p.waitForTimeout(300)
    const s = await p.evaluate(() => {
      const scroller = document.getElementById('content')
      const bar = document.querySelector('[data-conversation] [role=tablist]')?.parentElement
      const footer = document.querySelector('[data-panel-footer]')
      if (!scroller || !bar || !footer) return { missing: true }
      // Scroll back until the bar's place in the flow is just inside the composer's top.
      scroller.scrollTop -= footer.getBoundingClientRect().top + 8 - bar.getBoundingClientRect().top
      const b = bar.getBoundingClientRect()
      const f = footer.getBoundingClientRect()
      if (b.bottom <= f.top || b.top >= f.bottom) return { apart: true }
      const y = Math.max(b.top, f.top) + 2
      return { covered: !!document.elementFromPoint(b.left + 24, y)?.closest('[data-panel-footer]') }
    })
    if (s.missing) problems.push('the tab bar or the pinned composer was not found')
    else if (s.apart) problems.push('the tab bar could not be scrolled under the pinned composer')
    else if (s.covered === false) problems.push('the conversation\'s tab bar paints over the open composer pinned to the bottom')
  } catch (err) {
    problems.push(`could not be checked: ${err.message.split('\n')[0]}`)
  }
  return problems
}

// swipe-back-follows D4: on a task's page opened from the Inbox, a slow touch drag from
// the left edge to a fifth of the width springs back (the page moved with the finger, the
// route stays); a drag past a third goes back to the Inbox. Touch events are dispatched
// 10 px every 40 ms (0.25 px/ms), so neither drag is a flick. Returns the problems.
async function swipeBack(p, base, width) {
  const problems = []
  const drag = (to, release) => p.evaluate(async ({ to, release }) => {
    const pause = () => new Promise((r) => setTimeout(r, 40))
    const ev = (type, x) => window.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: 400, bubbles: true }))
    ev('pointerdown', 5)
    let mid = ''
    for (let x = 5; x <= to; x += 10) {
      ev('pointermove', x)
      await pause()
      if (!mid && x >= to / 2) mid = document.getElementById('content')?.style.transform ?? ''
    }
    if (release) ev('pointerup', to)
    return mid
  }, { to, release })
  const open = async () => {
    await openScreen(p, base + '/inbox')
    await p.locator('[data-task-id]').filter({ hasText: 'Undated inbox task' }).first().waitFor()
    // The edge watcher loads after the first paint.
    await p.waitForTimeout(300)
    const first = p.locator('[data-task-id]').filter({ hasText: 'Undated inbox task' }).first()
    // From 600 px a task opens as a sheet over the list (tablet-layouts D2): its page is
    // reached by its address, after the Inbox, so Back still leads to the Inbox.
    if (width >= 600) await p.goto(`${base}/task/${await first.getAttribute('data-task-id')}`)
    else await first.locator('[data-row-open]').press('Enter')
    await p.locator('[data-task-page]').first().waitFor({ timeout: 10000 })
  }
  try {
    await open()
    const short = await drag(Math.round(width / 5), true)
    if (!/translateX\(\d+(\.\d+)?px\)/.test(short)) problems.push(`the page did not follow the finger mid-drag (transform "${short}")`)
    await p.waitForTimeout(400)
    if (!(await p.locator('[data-task-page]').first().isVisible())) problems.push('a slow drag to a fifth of the width left the task page')
    const rest = await p.evaluate(() => document.getElementById('content')?.style.transform ?? '')
    if (rest) problems.push(`the page did not spring back (transform "${rest}")`)
    await drag(Math.round(width / 2), true)
    await p.locator('[data-task-id]').filter({ hasText: 'Undated inbox task' }).first().waitFor({ timeout: 10000 })
    // From 600 px the page was opened by its address, with no trail in the app: Back leads home, the list.
    if (!(width >= 600 ? /^\/(inbox)?$/ : /\/inbox$/).test(new URL(p.url()).pathname)) problems.push(`a drag past a third did not go back to the Inbox (${p.url()})`)
  } catch (e) {
    problems.push(`could not be checked: ${e.message.split('\n')[0]}`)
  }
  return problems
}

// The overlay's box once two readings 150 ms apart agree (at most about 3 s).
/**
 * Presses a row's completion circle (press-feedback-delay): the circle takes its pressed
 * colour (`press-selected`) by 100 ms, the engine holds that colour back 60 ms (the pressed
 * circle's computed transition delay for its background), and the row's body is not
 * pressed with it, so the row takes no tint. Colours are compared as drawn on a canvas, so two spellings of one colour
 * are equal; hover, which touch emulation may add on a press, is neither colour. The wait
 * is read from the engine rather than timed across the round trip to it, which on a busy
 * machine takes longer than the wait itself.
 */
async function pressFeedback(p) {
  // A press the emulation never reports as :active (it happens now and then in Chromium's
  // touch emulation) says nothing about the CSS: the next row is pressed instead, and a run
  // where neither registers is logged, not failed.
  for (let n = 0; n < 2; n++) {
    const res = await pressOnce(p, n)
    if (res) return res
  }
  log('  press feedback: no press registered as :active in two tries; not judged')
  return []
}

/** One press on the n-th row's circle; null when the press did not register. */
async function pressOnce(p, n) {
  const row = p.locator('li[data-task-id]').nth(n)
  const circle = row.locator('button:has(> [data-check-mark])').first()
  if (!(await circle.count())) return ['no completion circle on the first rows']
  const box = await circle.boundingBox()
  if (!box) return ['no completion circle on the first rows']
  const handles = [await circle.elementHandle(), await row.elementHandle()]
  const look = () => p.evaluate(([c, r]) => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    const rgba = (colour) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = colour; ctx.fillRect(0, 0, 1, 1); return ctx.getImageData(0, 0, 1, 1).data.join(',') }
    const token = (name) => { const d = document.createElement('div'); d.style.backgroundColor = `var(${name})`; document.body.append(d); const v = getComputedStyle(d).backgroundColor; d.remove(); return rgba(v) }
    const cs = getComputedStyle(c)
    const props = cs.transitionProperty.split(',').map((x) => x.trim())
    const delays = cs.transitionDelay.split(',').map((x) => parseFloat(x) * (x.trim().endsWith('ms') ? 1 : 1000))
    const i = props.findIndex((x) => x === 'background-color' || x === 'all')
    return {
      active: c.matches(':active'),
      circle: rgba(cs.backgroundColor), pressed: token('--ot-selected'),
      // The row's tint follows a press of its body (the part that opens the task); a
      // selected row has the same colour, so the press itself is what is read.
      rowPressed: !!r.querySelector(':scope > [data-row-open]:active'),
      wait: i < 0 ? null : delays[i % delays.length],
    }
  }, handles)
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await p.waitForTimeout(150)
  await p.mouse.down()
  const early = await look()
  await p.waitForTimeout(100)
  const held = await look()
  // Released off the circle, so the press does not complete the task.
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 200)
  await p.mouse.up()
  await p.waitForTimeout(400)
  if (!held.active) return null
  const out = []
  if (held.circle !== held.pressed) out.push(`the circle shows no pressed colour 100 ms in (${held.circle}, pressed is ${held.pressed})`)
  else if (held.wait === null || held.wait < 60) out.push(`the pressed circle's colour does not wait 60 ms (its transition delay is ${held.wait ?? 'none'})`)
  if (early.rowPressed || held.rowPressed) out.push('the row counts as pressed while its circle is')
  return out
}

/**
 * Hover and focus follow the input (touch-input-mode): a pointer resting on a task row
 * gives it no hover look, a tapped field and a tapped switch draw no focus ring, and Tab
 * after them draws one. The switch is tapped twice, so the setting is as it was.
 */
async function touchInput(p, base) {
  const out = []
  // The first row, read once its colour has settled; it fails only on the hover colour
  // itself (--ot-hover), drawn on a canvas so two spellings of one colour compare equal.
  const row = p.locator('li[data-task-id]').first()
  const bg = () => row.evaluate((el) => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    const rgba = (c) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); return ctx.getImageData(0, 0, 1, 1).data.join(',') }
    const d = document.createElement('div'); d.style.backgroundColor = 'var(--ot-hover)'; document.body.append(d)
    const hover = rgba(getComputedStyle(d).backgroundColor); d.remove()
    return { now: rgba(getComputedStyle(el).backgroundColor), hover }
  })
  await row.scrollIntoViewIfNeeded()
  let rest = await bg()
  for (let i = 0; i < 10; i++) {
    await p.waitForTimeout(150)
    const next = await bg()
    if (next.now === rest.now) break
    rest = next
  }
  const box = await row.boundingBox()
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await p.waitForTimeout(300)
  const hovered = await bg()
  if (hovered.now === hovered.hover && rest.now !== rest.hover) out.push('a resting pointer gives a task row its hover look')
  await p.mouse.move(0, 0)
  // The ring of the focused element: an outline or a box-shadow drawn by the focus.
  const ring = () => p.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return 'nothing focused'
    const cs = getComputedStyle(el)
    return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 ? `outline on ${el.tagName.toLowerCase()}` : cs.boxShadow !== 'none' && el.matches('.ui-input') ? `ring on ${el.tagName.toLowerCase()}` : ''
  })
  for (const [name, path, selector, twice] of [['field', '/settings/general/focus', 'input.ui-input:visible', false], ['switch', '/settings/general/focus', '[role="switch"]:visible', true]]) {
    await p.goto(base + path)
    const target = p.locator(selector).first()
    await target.waitFor({ timeout: 10000 }).catch(() => {})
    if (!(await target.count())) { out.push(`no ${name} on ${path} to tap`); continue }
    await target.tap()
    await p.waitForTimeout(100)
    const after = await ring()
    if (after) out.push(`a tapped ${name} shows a focus ring (${after})`)
    if (twice) await target.tap()
    await p.keyboard.press('Tab')
    await p.waitForTimeout(100)
    const tabbed = await ring()
    if (!tabbed.startsWith('outline') && !tabbed.startsWith('ring')) out.push(`Tab after a tapped ${name} draws no focus ring (${tabbed || 'none'})`)
  }
  return out
}

/**
 * A held row rises before its hold arms and settles after an early release; under
 * reduced motion it does not move (row-lift-overscroll). The touch is a pointer event
 * of type touch on the row's title, so the same code runs in every engine.
 */
async function rowLift(p, attempt = 1) {
  const out = []
  // One row for the whole probe: a list that is still filling in can change which row is
  // first between the press and the read, and a locator would then read another row.
  const first = p.locator('li[data-task-id]').first()
  if (!(await first.locator('[data-row-open]').count())) return ['no task row to hold']
  const row = await first.elementHandle()
  const title = await row.$('[data-row-open]')
  if (!title) return ['no task row to hold']
  await row.scrollIntoViewIfNeeded()
  const scale = () => row.evaluate((el) => {
    const t = getComputedStyle(el).transform
    return t === 'none' ? 1 : new DOMMatrixReadOnly(t).a
  })
  // The rise under way: a transform transition started on the row. On a loaded runner it
  // can still be in its 150 ms delay when the hold is read, with the scale still at 1.
  const rising = () => row.evaluate((el) => el.getAnimations().some((a) => a.transitionProperty === 'transform' && a.playState !== 'idle'))
  const hold = async (ms) => {
    const box = await title.boundingBox()
    if (!box) return { scale: 1, rising: false, state: 'replaced' }
    const at = { pointerId: 41, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: box.x + 8, clientY: box.y + box.height / 2 }
    await title.evaluate((el, at) => el.dispatchEvent(new PointerEvent('pointerdown', at)), at)
    await p.waitForTimeout(ms)
    const held = { scale: await scale(), rising: await rising(), state: await row.evaluate((el) => (!el.isConnected ? 'replaced' : el.hasAttribute('data-touch-press') ? 'pressed' : 'not pressed')) }
    await p.evaluate((at) => window.dispatchEvent(new PointerEvent('pointerup', at)), at)
    return held
  }
  const lifted = await hold(300)
  if (!(lifted.scale > 1.001) && !lifted.rising) out.push(`a row held for 300 ms has not risen (scale ${lifted.scale}, row ${lifted.state})`)
  // A row re-rendered under the probe (the list still filling in) is the probe's problem,
  // not the app's: hold a fresh row once more, and report only a second replacement.
  if (lifted.state === 'replaced') {
    if (attempt === 1) { await p.waitForTimeout(500); return rowLift(p, 2) }
    return ['the held row was re-rendered while it was held, twice']
  }
  // Settled once its transitions end (a loaded runner can take longer than their 350 ms), at most 2 s.
  await row.evaluate((el) => Promise.race([Promise.all(el.getAnimations().map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 2000))]))
  await p.waitForTimeout(50)
  const settled = await scale()
  if (Math.abs(settled - 1) > 0.0005) out.push(`a row released early has not settled (scale ${settled})`)
  await p.emulateMedia({ reducedMotion: 'reduce' })
  const still = await hold(300)
  await p.emulateMedia({ reducedMotion: null })
  if (still.state === 'replaced') {
    if (attempt === 1) { await p.waitForTimeout(500); return [...out, ...await rowLift(p, 2)] }
    return [...out, 'the held row was re-rendered before the reduced-motion hold, twice']
  }
  if (Math.abs(still.scale - 1) > 0.0005 || still.rising) out.push(`under reduced motion a held row moves (scale ${still.scale})`)
  return out
}

async function settledBox(p, overlay) {
  let prev = await overlay.boundingBox()
  for (let i = 0; i < 20; i++) {
    await p.waitForTimeout(150)
    const next = await overlay.boundingBox()
    if (!prev || !next || (prev.x === next.x && prev.y === next.y && prev.width === next.width && prev.height === next.height)) return next
    prev = next
  }
  return prev
}

async function checkOverlay(p, screen, name, { overlay, trigger, kind, destructive, escapes = 1, reopen, fit }, fail, shot) {
  // How to open it again: the trigger, or a step through a menu (`reopen`).
  const open = reopen ?? (() => trigger.click())
  await overlay.waitFor({ state: 'visible', timeout: 5000 })
  await p.waitForTimeout(250)
  const handle = await overlay.elementHandle()
  const geo = await p.evaluate(overlayGeometry, handle)
  for (const m of geo.problems) await fail(p, screen, name, m)
  for (const m of await p.evaluate(pageOverflow)) await fail(p, screen, name, m)
  for (const m of await p.evaluate(tabRowOverflow)) await fail(p, screen, name, m)
  for (const m of await p.evaluate(cutLabels)) await fail(p, screen, name, m)
  const tagged = await overlay.evaluate((el) => (el.hasAttribute('data-overlay') ? el : el.closest('[data-overlay]')) ? true : false)
  const sel = await overlay.evaluate((el) => { el.setAttribute('data-layout-check', ''); return '[data-layout-check]' })
  for (const m of await p.evaluate(smallTargets, [sel, MIN_TARGET])) await fail(p, screen, name, `touch target: ${m}`)
  for (const m of await p.evaluate(smallFields, [sel, MIN_FIELD_TEXT])) await fail(p, screen, name, `text field: ${m}`)
  for (const m of await p.evaluate(touchFeel, [sel])) await fail(p, screen, name, `touch: ${m}`)
  for (const m of await p.evaluate(tintDrift, sel)) await fail(p, screen, name, m)
  // Its content fits the panel: nothing sideways out of it, no sentence squeezed by its buttons (issue #731).
  if (fit) for (const m of await p.evaluate(overlayContentFit, sel)) await fail(p, screen, name, m)
  await overlay.evaluate((el) => el.removeAttribute('data-layout-check'))
  await shot(p, screen, name)
  if (kind === 'toast' || kind === 'inline' || kind === 'drawer' || kind === 'combobox') {
    if (kind === 'combobox') {
      await p.keyboard.press('Escape')
      if (await overlay.isVisible()) await fail(p, screen, name, 'does not close with Escape')
    }
    if (kind === 'drawer') {
      await p.mouse.click(p.viewportSize().width - 10, p.viewportSize().height / 2)
      // Until it has slid away: a busy runner can take longer than the slide itself.
      const gone = () => overlay.boundingBox().then((b) => !b || b.x + b.width <= 1)
      let closed = await gone()
      for (let i = 0; !closed && i < 20; i++) { await p.waitForTimeout(100); closed = await gone() }
      if (!closed) await fail(p, screen, name, 'drawer does not close with a tap outside')
    }
    return
  }
  if (!tagged && kind !== 'panel') await fail(p, screen, name, 'is not built on the overlay module (no data-overlay)')
  // Scrolling inside a modal overlay leaves the page behind where it was.
  if (kind === 'popover' || kind === 'dialog') {
    const scrollers = () => [...document.querySelectorAll('main .overflow-y-auto')].map((e) => e.scrollTop).join(',')
    const box = await overlay.boundingBox()
    const before = await p.evaluate(scrollers)
    const wheeled = box && await p.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height - 5, 60)).then(() => p.mouse.wheel(0, 600)).then(() => true, () => false)
    if (wheeled) {
      await p.waitForTimeout(200)
      if ((await p.evaluate(scrollers)) !== before) await fail(p, screen, name, 'the page behind scrolls while the overlay is open')
    }
  }
  // Escape closes (a picker step needs two: back, then close), focus returns to the trigger.
  for (let i = 0; i < escapes; i++) { if (i) await p.waitForTimeout(150); await p.keyboard.press('Escape') }
  if (!(await closes(overlay))) await fail(p, screen, name, 'does not close with Escape')
  else if (trigger) {
    const back = await trigger.evaluate((el) => el === document.activeElement || el.contains(document.activeElement)).catch(() => false)
    if (!back) await fail(p, screen, name, 'focus does not return to the trigger after Escape')
  }
  if (!trigger) return
  // Close button (dialogs, sheets) or tap outside (anchored popovers).
  await open()
  await overlay.waitFor({ state: 'visible', timeout: 5000 })
  if (geo.hasClose) {
    await overlay.locator('[data-overlay-close], button[aria-label="Close"]').first().click()
    if (!(await closes(overlay))) { await fail(p, screen, name, 'does not close with its close button'); await p.keyboard.press('Escape') }
  } else if (kind === 'dialog') {
    await fail(p, screen, name, 'dialog has no close button')
    await p.keyboard.press('Escape')
  }
  if (kind === 'popover' || (kind === 'dialog' && !destructive)) {
    if (!(await overlay.isVisible().catch(() => false))) {
      await open()
      await overlay.waitFor({ state: 'visible', timeout: 5000 })
    }
    const vs = p.viewportSize()
    // Content that loads after opening (the share dialog's invite links) can grow
    // and re-centre the panel: measure only once its box has stopped changing,
    // or the "outside" point may end up inside it.
    const box = await settledBox(p, overlay)
    // A full-screen sheet has no outside to tap.
    if (box && box.x <= 1 && box.width >= vs.width - 1 && box.y <= 1) { await p.keyboard.press('Escape'); return }
    // A point outside the panel: above a bottom sheet, else a top corner. The
    // tap must not land on a control, or it would also press it (a chip or a
    // link under the point) and change the screen for the next overlay. A task
    // row counts: a click anywhere on it opens the task's page (task-full-page).
    const preferred = box && box.y > 40 ? { x: vs.width / 2, y: Math.max(5, box.y / 2) } : { x: 5, y: vs.height - 5 }
    const candidates = [preferred, { x: 5, y: vs.height - 5 }, { x: vs.width - 5, y: vs.height - 5 }, { x: vs.width / 2, y: vs.height - 5 }, { x: vs.width - 5, y: 5 }]
    const outside = (q) => !box || q.x < box.x || q.x > box.x + box.width || q.y < box.y || q.y > box.y + box.height
    let pt = preferred
    for (const q of candidates.filter(outside)) {
      const inert = await p.evaluate(({ x, y }) => !document.elementFromPoint(x, y)?.closest('button, a, input, select, textarea, label, [role="button"], [role="switch"], [tabindex], [data-task-id]'), q)
      if (inert) { pt = q; break }
    }
    const address = p.url()
    // What the tap lands on, so a failure names it (an element over the backdrop,
    // or a panel that grew under the point after it was measured).
    const under = await p.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return el ? `${el.tagName.toLowerCase()}${el.hasAttribute('data-overlay-root') ? '[data-overlay-root]' : ''}${el.getAttribute('aria-label') ? ` "${el.getAttribute('aria-label')}"` : ''}` : 'nothing' }, pt)
    await p.mouse.click(pt.x, pt.y)
    if (!(await closes(overlay))) {
      const now = await overlay.boundingBox().catch(() => null)
      const fmt = (b) => b ? `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}x${Math.round(b.height)}` : 'none'
      await fail(p, screen, name, `does not close with a tap outside (tap at ${Math.round(pt.x)},${Math.round(pt.y)} on ${under}; panel ${fmt(box)}, now ${fmt(now)})`)
      await p.keyboard.press('Escape')
    }
    // The tap only closes: a tap that also opened another page would leave the next
    // overlay on the wrong screen.
    if (p.url() !== address) await fail(p, screen, name, `a tap outside also opened ${new URL(p.url()).pathname} (tap at ${Math.round(pt.x)},${Math.round(pt.y)} on ${under})`)
  }
}

// ------------------------------------------------------------------ main
log('· seeding', base)
const ids = { ...await seedAccount({ base, pw, lang: LANG, now: NOW }), date: LAYOUT_DATE }
const llmServer = ids.llm
const combos = []
for (const e of ENGINES) for (const w of WIDTHS) for (const t of THEMES) combos.push([e, w, t])
const mine = combos.filter((_, i) => i % SHARD_OF === SHARD_AT - 1)
log(`· checking ${mine.length} combinations (${ENGINES.join(', ')} × ${WIDTHS.join('/')} px × ${THEMES.join('/')}${SHARD_OF > 1 ? `, shard ${SHARD_AT}/${SHARD_OF}` : ''})`)
const queue = [...mine]
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
  while (queue.length) { const [e, w, t] = queue.shift(); await runCombo(e, w, t, ids) }
}))
llmServer?.close()
writeFileSync(`${outDir}/failures.txt`, failures.join('\n') + '\n')
if (failures.length) {
  log(`\n✗ ${failures.length} layout problems (screenshots in ${outDir}/):`)
  for (const f of failures) log('  -', f)
  process.exit(1)
}
log('\nLAYOUT OK')
// A stalled browser that was given up on above can keep the event loop alive.
process.exit(0)
