// Layout check (OpenSpec change `mobile-layout`): opens every screen and every
// overlay at phone and tablet widths, in light and dark, in Chromium and WebKit,
// and fails when
//   - a page scrolls sideways outside a designated scroll region (`data-scroll-x`),
//   - more than three regions scroll vertically outside designated ones (`data-scroll-y`),
//   - an overlay or its close control is outside the viewport or not clickable,
//   - an overlay does not close with Escape, with its close button (sheets and
//     dialogs) or with a tap outside (popovers),
//   - a control on the touch screen is smaller than 44 × 44 px or only appears on hover,
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
// signed-out screens start in it too; OpenSpec change app-localization 11.1).
const pw = await import('playwright').catch(async () => {
  const { createRequire } = await import('node:module')
  const { execSync } = await import('node:child_process')
  return createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')
})
import { mkdirSync, writeFileSync } from 'node:fs'
import { MAX_SCROLLERS, addButtonCovers, axeProblems, pageOverflow, rowMisalignment, settled, smallTargets, verticalScrollers } from './ux-audit/measure.mjs'
import { seed as seedAccount } from './ux-audit/seed.mjs'
import { OVERLAYS, chooseLayout, closes, screens } from './ux-audit/layout-screens.mjs'

const base = process.env.OPENTODO_URL ?? 'http://127.0.0.1:8080'
const outDir = process.argv[2] ?? 'layout-report'
const ENGINES = (process.env.ENGINES ?? 'chromium,webkit').split(',').filter(Boolean)
const HEIGHTS = { 320: 640, 360: 740, 390: 844, 768: 1024, 1280: 900 }
const WIDTHS = (process.env.WIDTHS ?? '360,390,768').split(',').map(Number)
const THEMES = (process.env.THEMES ?? 'light,dark').split(',')
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 3)
const SHOTS_ALL = process.env.SHOTS === 'all'
const LANG = process.env.OPENTODO_LANG ?? ''
// Screens wait on English headings and overlays are opened by English names: in another
// language (the German leg, ux-audit-three-widths F4) every screen is checked once a
// heading, a task row or an alert shows, without its overlays or layout switches.
const OTHER_LANG = !!LANG && LANG !== 'en'
const anyReady = (p) => p.locator('main :is(h1, [data-page-body], [data-task-id]), [data-screen], h1, form').first().waitFor({ timeout: 15000 })
const MIN_TARGET = 44
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
  const run = { browser: null, step: 'launching the browser' }
  let timer
  const stalled = new Promise((resolve) => { timer = setTimeout(() => resolve('stalled'), COMBO_TIMEOUT_MS) })
  const outcome = await Promise.race([runComboOnce(engine, width, theme, ids, mine, run), stalled])
  clearTimeout(timer)
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
    if (LANG) for (const c of [anonCtx, ctx]) await c.addInitScript((code) => { try { localStorage.setItem('opentodo.lang', code) } catch { /* storage blocked */ } }, LANG)
    const page = await ctx.newPage()
    page.on('dialog', (d) => d.dismiss())
    const pageErrors = []
    // WebKit reports fetches cut off by a navigation as errors; those are not app bugs.
    page.on('pageerror', (e) => { if (!/access control checks|Load failed|The network connection was lost|cancelled/i.test(e.message)) pageErrors.push(e.message) })
    await page.goto(base + '/inbox')
    await page.locator('[data-task-id]').first().waitFor({ timeout: 30000 })
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
        await p.goto(base + s.path)
        await (OTHER_LANG ? anyReady : s.ready)(p)
        if (s.layout) {
          await chooseLayout(p, s.layout)
          await p.waitForTimeout(300)
        }
        await p.waitForTimeout(250)
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
      for (const m of await p.evaluate(smallTargets, [null, MIN_TARGET])) await fail(p, s.name, null, `touch target: ${m}`)
      for (const m of await p.evaluate(rowMisalignment)) await fail(p, s.name, null, m)
      for (const m of await p.evaluate(addButtonCovers)) await fail(p, s.name, null, m)
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
      for (const o of OTHER_LANG ? [] : s.overlays ?? []) {
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


// The overlay's box once two readings 150 ms apart agree (at most about 3 s).
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

async function checkOverlay(p, screen, name, { overlay, trigger, kind, destructive, escapes = 1, reopen }, fail, shot) {
  // How to open it again: the trigger, or a step through a menu (`reopen`).
  const open = reopen ?? (() => trigger.click())
  await overlay.waitFor({ state: 'visible', timeout: 5000 })
  await p.waitForTimeout(250)
  const handle = await overlay.elementHandle()
  const geo = await p.evaluate(overlayGeometry, handle)
  for (const m of geo.problems) await fail(p, screen, name, m)
  for (const m of await p.evaluate(pageOverflow)) await fail(p, screen, name, m)
  const tagged = await overlay.evaluate((el) => (el.hasAttribute('data-overlay') ? el : el.closest('[data-overlay]')) ? true : false)
  const sel = await overlay.evaluate((el) => { el.setAttribute('data-layout-check', ''); return '[data-layout-check]' })
  for (const m of await p.evaluate(smallTargets, [sel, MIN_TARGET])) await fail(p, screen, name, `touch target: ${m}`)
  await overlay.evaluate((el) => el.removeAttribute('data-layout-check'))
  await shot(p, screen, name)
  if (kind === 'toast' || kind === 'inline' || kind === 'drawer' || kind === 'combobox') {
    if (kind === 'combobox') {
      await p.keyboard.press('Escape')
      if (await overlay.isVisible()) await fail(p, screen, name, 'does not close with Escape')
    }
    if (kind === 'drawer') {
      await p.mouse.click(p.viewportSize().width - 10, p.viewportSize().height / 2)
      await p.waitForTimeout(350)
      const box = await overlay.boundingBox()
      if (box && box.x + box.width > 1) await fail(p, screen, name, 'drawer does not close with a tap outside')
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
    // link under the point) and change the screen for the next overlay.
    const preferred = box && box.y > 40 ? { x: vs.width / 2, y: Math.max(5, box.y / 2) } : { x: 5, y: vs.height - 5 }
    const candidates = [preferred, { x: 5, y: vs.height - 5 }, { x: vs.width - 5, y: vs.height - 5 }, { x: vs.width / 2, y: vs.height - 5 }, { x: vs.width - 5, y: 5 }]
    const outside = (q) => !box || q.x < box.x || q.x > box.x + box.width || q.y < box.y || q.y > box.y + box.height
    let pt = preferred
    for (const q of candidates.filter(outside)) {
      const inert = await p.evaluate(({ x, y }) => !document.elementFromPoint(x, y)?.closest('button, a, input, select, textarea, label, [role="button"], [role="switch"], [tabindex]'), q)
      if (inert) { pt = q; break }
    }
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
  }
}

// ------------------------------------------------------------------ main
log('· seeding', base)
const ids = await seedAccount({ base, pw, lang: LANG })
const llmServer = ids.llm
const combos = []
for (const e of ENGINES) for (const w of WIDTHS) for (const t of THEMES) combos.push([e, w, t])
log(`· checking ${combos.length} combinations (${ENGINES.join(', ')} × ${WIDTHS.join('/')} px × ${THEMES.join('/')})`)
const queue = [...combos]
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
