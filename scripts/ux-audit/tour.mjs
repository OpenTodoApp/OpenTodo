// The interface audit tour (OpenSpec change ux-audit-three-widths, D6): opens every
// entry of the screen inventory (scripts/ux-audit/screens.json) on the built app
// with the layout check's seeded account, at 360 and 768 px as a touch device (as the
// layout check emulates them) and 1280 px with a mouse, light and dark,
// English and German; saves a screenshot of each and measures the interface budget
// and the audited rules (D3), then the first interaction from the local copy with
// the server stopped (M13) and story coverage (M14). Writes report.json and an
// index.html contact sheet. Changes nothing in the app or the repository.
//
//   make ux-audit                          builds the app, runs this, prints the report path
//   node scripts/ux-audit/tour.mjs         against an existing bin/opentodo
//
// Env: OUT_DIR (default ux-audit-report), ONLY (inventory ids), WIDTHS (360,768,1280),
// THEMES (light,dark), LANGS (en,de), CONCURRENCY (2), TEXT_SIZE (the browser's default font size in px,
// as its text size setting sets it, e.g. 20 or 24; default 16), CHROMIUM_PATH, OPENTODO_BIN
// (bin/opentodo), TOUCH_BELOW (1280: narrower widths are touch devices), UX_AUDIT_STRICT=1 (exit 1 on budget, overflow, story-coverage and reduced-motion
// violations; otherwise the tour only reports and exits 0).
//
// The accessibility gate (OpenSpec change accessibility-aa, D1 and D2): A11Y_ONLY=1 takes no
// screenshots and skips the budget, motion and offline measures, and checks only the
// accessibility rules: axe serious and critical (M1, M9), focus visible (M8) and not
// obscured (M17) on a Tab walk of every entry at every width, target size per WCAG 2.5.8
// (M21: 24 px or 24 px of spacing), reflow at 320 x 256 CSS px (M18; regions listed in
// reflow-exempt.json may scroll inside themselves), text spacing (M19) and credential fields
// (M20, 3.3.8). A11Y_STRICT=1 adds those measures to a full tour. Either one exits 1 on any
// finding of those rules or a screen that did not open; serious and critical axe findings
// cannot be exempted. SHARD=i/n checks every n-th entry from the i-th (CI runs two shards);
// REFLOW_SHOTS=1 saves each entry at 320 px as shots/<id>-320.jpg.
const pw = await import('playwright').catch(async () => {
  const { createRequire } = await import('node:module')
  const { execSync } = await import('node:child_process')
  return createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')
})
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { BUDGET, axeProblems, verticalScrollers } from './measure.mjs'
import {
  chromeRows, credentialFields, focusWalk, horizontalOverflow, installHelpers, layoutShift, LAYOUT_SHIFT_INIT, motionSeen,
  overlaps, primaryDestinations, reflow, rowMetaItems, targetSize, targetSizeWcag, TEXT_SPACING_CSS, textSpacingClip, truncation, watchMotion,
} from './audit-measures.mjs'
import { seed } from './seed.mjs'
import { OVERLAYS, chooseLayout, screens as layoutScreens } from './layout-screens.mjs'
import { inventory } from './inventory.mjs'
import { A11Y_RULES, STRICT_RULES, summarize, writeReport } from './report.mjs'
import { coverage } from './stories.mjs'

const OUT = resolve(process.env.OUT_DIR ?? 'ux-audit-report')
const BIN = process.env.OPENTODO_BIN ?? 'bin/opentodo'
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null
const WIDTHS = (process.env.WIDTHS ?? '360,768,1280').split(',').map(Number)
const THEMES = (process.env.THEMES ?? 'light,dark').split(',')
const LANGS = (process.env.LANGS ?? 'en,de').split(',')
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 2)
const STRICT = process.env.UX_AUDIT_STRICT === '1'
const TEXT_SIZE = Number(process.env.TEXT_SIZE ?? 16)
// Widths below this are touch devices; TOUCH_BELOW=0 makes every width a computer with a mouse
// (640 px with a mouse is a 1280 px window at 200% zoom).
const TOUCH_BELOW = Number(process.env.TOUCH_BELOW ?? 1280)
/**
 * The layout a width gets at this text size: the app's breakpoints are in rem, so at text
 * size 20 a 768 px window lays out like a 614 px one (the phone layout) and 1280 px like
 * 1024 px. Entries and overlay openers that depend on the layout use this class, not the pixels.
 */
const layoutWidth = (w) => { const e = (w * 16) / TEXT_SIZE; return e < 640 ? 360 : e < 1100 ? 768 : 1280 }
const A11Y_ONLY = process.env.A11Y_ONLY === '1'
const A11Y = A11Y_ONLY || process.env.A11Y_STRICT === '1'
const SHARD = process.env.SHARD ? process.env.SHARD.split('/').map(Number) : null
const REFLOW_EXEMPT = JSON.parse(readFileSync(new URL('./reflow-exempt.json', import.meta.url), 'utf8')).regions.map((r) => r.selector)
const HEIGHTS = { 360: 740, 768: 1024, 1280: 900 }
const log = (...a) => console.log(...a)
mkdirSync(join(OUT, 'shots'), { recursive: true })

// ---------------------------------------------------------------- server
const freePort = () => new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)) }) })
const dataDir = mkdtempSync(join(tmpdir(), 'opentodo-ux-audit-'))
const port = await freePort()
const base = `http://127.0.0.1:${port}`
const server = spawn(BIN, [], { env: { ...process.env, OPENTODO_ADDR: `127.0.0.1:${port}`, OPENTODO_DATA_DIR: dataDir }, stdio: 'ignore' })
const stopServer = () => { if (server.exitCode === null) server.kill() }
process.on('exit', () => { stopServer(); rmSync(dataDir, { recursive: true, force: true }) })
for (let i = 0; ; i++) {
  try { if ((await fetch(`${base}/healthz`)).ok) break } catch { /* starting */ }
  if (i > 100) throw new Error(`${BIN} did not start on ${base}`)
  await new Promise((r) => setTimeout(r, 100))
}

// ---------------------------------------------------------------- what to open
const entries = inventory()
const tourable = entries.filter((e) => e.tour !== false && (!ONLY || ONLY.has(e.id)))
  .filter((_, i) => !SHARD || i % SHARD[1] === SHARD[0] - 1)
const fill = (path, ids) => path.replace(/\{(\w+)\}/g, (_, k) => ids[k] ?? k)

/** The screen an entry is captured on: a layout-check screen or its own path and ready selector. */
function hostOf(e, ids) {
  const named = layoutScreens(ids, base)
  const name = e.kind === 'overlay' ? e.on : e.layoutCheck
  if (name) {
    const s = named.find((x) => x.name === name)
    if (!s) throw new Error(`layout-check screen "${name}" not found`)
    return s
  }
  return { name: e.id, own: true, path: fill(e.path, ids), anon: !!e.anon, ready: (p) => p.locator(e.ready).first().waitFor() }
}

async function runSteps(p, steps = []) {
  for (const s of steps) {
    if (s.clickIfVisible) { const l = p.locator(s.clickIfVisible).first(); if (await l.isVisible()) { await l.click(); await p.waitForTimeout(350) } }
    if (s.click) await p.locator(s.click).first().click()
    if (s.focus) await p.locator(s.focus).first().click()
    if (s.type) await p.keyboard.type(s.type, { delay: 5 })
    await p.waitForTimeout(250)
  }
}

/** Opens an overlay entry on its screen; returns the overlay's locator, or null for an inline state. */
async function openOverlay(p, e, width) {
  const key = e.layoutCheck ?? e.open?.overlay
  let overlay = null
  if (key) {
    const res = await OVERLAYS[key](p, { width })
    if (!res) throw new Error(`opener "${key}" does not apply here`)
    overlay = res.overlay
    await overlay.waitFor({ state: 'visible', timeout: 5000 })
  }
  await runSteps(p, e.open?.steps)
  await p.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().endTime !== Infinity).map((a) => a.finished.catch(() => {}))))
  return overlay
}

// ---------------------------------------------------------------- one capture
const axeRecords = (lines) => lines.map((l) => {
  const m = l.match(/^axe (\w+) ([\w-]+): (.*?) \((.*)\)$/)
  return m ? { rule: m[2] === 'color-contrast' ? 'M9' : 'M1', element: m[4], value: `${m[1]} ${m[2]}`, limit: 0, detail: m[3] } : { rule: 'M1', element: 'page', value: l, limit: 0 }
})

async function measure(p, e, combo, overlay) {
  const v = []
  if (overlay) await overlay.evaluate((el) => el.setAttribute('data-axe-target', '')).catch(() => {})
  v.push(...axeRecords(await axeProblems(p, overlay ? '[data-axe-target]' : undefined)))
  if (overlay) await overlay.evaluate((el) => el.removeAttribute('data-axe-target')).catch(() => {})
  await installHelpers(p)
  if (A11Y_ONLY) return [...v, ...await accessibility(p, e, combo)]
  if (e.kind !== 'overlay') {
    const allowance = e.route === 'project' ? BUDGET.PROJECT_CHROME_ALLOWANCE : BUDGET.MAX_CHROME_ROWS
    v.push(...await p.evaluate(chromeRows, allowance))
    v.push(...await p.evaluate(rowMetaItems, BUDGET.MAX_ROW_META_ITEMS))
    v.push(...await p.evaluate(primaryDestinations, BUDGET.MAX_PRIMARY_DESTINATIONS))
    const scrollers = await p.evaluate(verticalScrollers)
    if (scrollers.length > BUDGET.MAX_SCROLLERS) v.push({ rule: 'M5', element: scrollers.join(', ').slice(0, 300), value: scrollers.length, limit: BUDGET.MAX_SCROLLERS })
    v.push(...await p.evaluate(layoutShift, 0.1))
  }
  v.push(...await p.evaluate(horizontalOverflow))
  v.push(...await p.evaluate(targetSize, [combo.width < 1280 ? 44 : 24, combo.width >= 1280]))
  v.push(...await p.evaluate(truncation))
  v.push(...await p.evaluate(overlaps))
  if (A11Y) v.push(...await accessibility(p, e, combo))
  else if (combo.width === 1280 && combo.lang === LANGS[0] && e.kind !== 'overlay' && !e.anon) v.push(...await focusWalk(p, 60))
  return v
}

/**
 * The accessibility gate's measures beyond axe (accessibility-aa D2) on the open screen or
 * overlay: credential fields and WCAG target size; once per entry (first width and theme)
 * text spacing and reflow at 320 x 256; then the Tab walk last, since its Escape ends it.
 */
async function accessibility(p, e, combo) {
  const v = []
  v.push(...await p.evaluate(credentialFields, e.kind === 'signed-out' || !!e.anon))
  v.push(...await p.evaluate(targetSizeWcag))
  if (combo.width === WIDTHS[0] && combo.theme === THEMES[0]) {
    const style = await p.addStyleTag({ content: TEXT_SPACING_CSS })
    await p.waitForTimeout(100)
    v.push(...await p.evaluate(textSpacingClip))
    await style.evaluate((el) => el.remove())
    const size = p.viewportSize()
    await p.setViewportSize({ width: 320, height: 256 })
    await p.waitForTimeout(300)
    v.push(...await p.evaluate(reflow, REFLOW_EXEMPT))
    if (process.env.REFLOW_SHOTS === '1') await p.screenshot({ path: join(OUT, `shots/${e.id}-320.jpg`), type: 'jpeg', quality: 70, fullPage: false })
    await p.setViewportSize(size)
    await p.waitForTimeout(300)
  }
  if (combo.lang === LANGS[0]) v.push(...await focusWalk(p, 60, { obscured: true, keep: e.kind === 'overlay' }))
  return v
}

/** The browser's text size setting (precision-polish-2): Chromium's default font size, through DevTools. */
async function sizeText(p) {
  if (TEXT_SIZE === 16) return p
  const cdp = await p.context().newCDPSession(p)
  await cdp.send('Page.setFontSizes', { fontSizes: { standard: TEXT_SIZE } })
  return p
}

async function capture(ctx, anonCtx, page, e, combo, ids) {
  const host = hostOf(e, ids)
  const p = host.anon ? await sizeText(await anonCtx.newPage()) : page
  const shot = `shots/${e.id}-${combo.width}-${combo.theme}-${combo.lang}${TEXT_SIZE === 16 ? '' : `-t${TEXT_SIZE}`}.jpg`
  const out = { id: e.id, width: combo.width, theme: combo.theme, lang: combo.lang, shot, violations: [] }
  const load = async (hideToasts = false) => {
    await p.goto(base + host.path)
    // A later language: the screens' ready signals are English headings (as in the layout check).
    await (combo.lang === LANGS[0] || host.own ? host.ready(p) : p.locator('main :is(h1, [data-page-body], [data-task-id]), [data-screen], h1, form').first().waitFor({ timeout: 15000 }))
    if (host.layout) { await chooseLayout(p, host.layout); await p.waitForTimeout(300) }
    // A project screen is captured in its list layout, whatever an earlier capture left (the layout is synced).
    else if (host.path.startsWith('/project/') && await p.getByRole('group', { name: 'Project layout' }).getByRole('button', { name: 'List' }).isVisible().catch(() => false)) {
      // A layout another combination chose can still arrive by sync after the click: List is
      // chosen again until it holds for a moment (CI saw a Timeline land under the Share dialog).
      const list = p.getByRole('group', { name: 'Project layout' }).getByRole('button', { name: 'List' })
      for (let i = 0; i < 4; i++) {
        if ((await list.getAttribute('aria-pressed').catch(() => null)) !== 'true') await chooseLayout(p, 'List').catch(() => {})
        await p.waitForTimeout(400)
        if ((await list.getAttribute('aria-pressed').catch(() => null)) === 'true') break
      }
      await host.ready(p)
    }
    await p.waitForTimeout(300)
    if (e.kind !== 'overlay') return null
    // The retry opens the overlay with the toasts out of the way (a reminder that fired meanwhile
    // can cover the control the opener clicks), then shows them again for the measures.
    const hide = hideToasts ? await p.addStyleTag({ content: '[data-toast-region]{visibility:hidden!important}' }) : null
    try { return await openOverlay(p, e, layoutWidth(combo.width)) } finally { await hide?.evaluate((el) => el.remove()).catch(() => {}) }
  }
  try {
    // A screen that does not load is retried once (a slow machine), as the layout check does.
    const overlay = await load().catch(async () => { await p.keyboard.press('Escape').catch(() => {}); return load(true) })
    if (!A11Y_ONLY) await p.screenshot({ path: join(OUT, shot), type: 'jpeg', quality: 55 })
    out.violations = await measure(p, e, combo, overlay)
  } catch (err) {
    out.violations = [{ rule: 'NAV', element: e.id, value: err.message.split('\n')[0].slice(0, 200), limit: 'opens' }]
    await p.screenshot({ path: join(OUT, shot), type: 'jpeg', quality: 55 }).catch(() => {})
  }
  // Escape first: an open overlay would take the click that restores the layout.
  await p.keyboard.press('Escape').catch(() => {})
  if (host.layout) await chooseLayout(p, 'List').catch(() => {})
  if (host.anon) await p.close()
  return out
}

// ---------------------------------------------------------------- one combination
// The combinations run side by side on one account, and a project's layout (List, Board,
// Timeline, Calendar) is a synced setting of that project: captures on the same project
// take turns, so one combination's Board capture never shows under another's menu.
const locks = new Map()
function serial(key, fn) {
  if (!key) return fn()
  const run = (locks.get(key) ?? Promise.resolve()).then(fn, fn)
  locks.set(key, run.catch(() => {}))
  return run
}
const launch = () => pw.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})

async function runCombo(combo, ids) {
  const browser = await launch()
  const opts = {
    viewport: { width: combo.width, height: HEIGHTS[combo.width] ?? 900 }, colorScheme: combo.theme,
    hasTouch: combo.width < TOUCH_BELOW, isMobile: combo.width < TOUCH_BELOW, deviceScaleFactor: 1, locale: 'en-GB', timezoneId: 'UTC', bypassCSP: true,
  }
  const out = []
  try {
    const anonCtx = await browser.newContext(opts)
    const ctx = await browser.newContext({ ...opts, storageState: ids.storageState })
    for (const c of [anonCtx, ctx]) {
      await c.addInitScript(LAYOUT_SHIFT_INIT)
      await c.addInitScript((code) => { try { localStorage.setItem('opentodo.lang', code) } catch { /* storage blocked */ } }, combo.lang)
    }
    const page = await sizeText(await ctx.newPage())
    page.on('dialog', (d) => d.dismiss())
    await page.goto(base + '/inbox')
    await page.locator('[data-task-id]').first().waitFor({ timeout: 30000 })
    for (const e of tourable) {
      if (e.widths && !e.widths.includes(layoutWidth(combo.width))) continue
      if (hostOf(e, ids).widths && !hostOf(e, ids).widths.includes(layoutWidth(combo.width))) continue
      // The overlay openers find controls by their English names (as the layout check
      // does): overlays are captured in the first language, every screen in each.
      if (e.kind === 'overlay' && combo.lang !== LANGS[0]) continue
      if (combo.lang !== LANGS[0] && hostOf(e, ids).layout) continue
      const path = hostOf(e, ids).path
      out.push(await serial(path.startsWith('/project/') ? path : null, () => capture(ctx, anonCtx, page, e, combo, ids)))
    }
  } finally {
    await browser.close()
  }
  log(`  ${combo.width}px ${combo.theme} ${combo.lang}: ${out.length} captures, ${out.reduce((n, c) => n + c.violations.length, 0)} violations`)
  return out
}

/** The interface language is a synced preference: written like any device would (as the layout check does). */
async function setLanguage(ids, lang) {
  const api = await pw.request.newContext({ baseURL: base, storageState: ids.storageState, extraHTTPHeaders: { Origin: base } })
  const r = await api.post('/api/v1/sync', { data: { device: 'ux-audit', cursor: 0, ops: [{ id: `lang-${lang}-${Date.now()}`, entity: 'user_prefs', entityId: 'me', field: 'language', value: lang, ts: Date.now(), device: 'ux-audit' }] } })
  if (!r.ok()) throw new Error(`setting the language → ${r.status()}`)
  await api.dispose()
}

// ---------------------------------------------------------------- M15 and M13
/**
 * M15 in a reduced-motion context (motion-polish D4): every overlay of the inventory
 * opened on its screen at 1280 px with a mouse and at 360 px as a touch device, the
 * completion of a task in Today, and a drag on the board, the Plan and the Week. Each
 * moment is watched from before the action until it settles, so a short movement
 * that ends before a snapshot is caught too.
 */
async function reducedMotion(ids) {
  const out = []
  const moments = MOTION_WIDTHS.flatMap((width) => [
    ...tourable.filter((e) => e.kind === 'overlay' && (e.layoutCheck ?? e.open?.overlay) && e.on && (!e.widths || e.widths.includes(width))
      && (!hostOf(e, ids).widths || hostOf(e, ids).widths.includes(width))).map((e) => ({ id: e.id, width, screen: e.on, act: (p) => openOverlay(p, e, width) })),
    ...(!ONLY || ONLY.has('today') ? [{ id: 'today', width, screen: 'today', act: (p) => p.locator('[data-task-id]').filter({ hasText: width === 1280 ? 'Get three quotes' : 'Renew passport' }).first().locator('.group\\/check').first().click() }] : []),
    ...(width === 1280 ? DRAGS.filter((d) => !ONLY || ONLY.has(d.screen)).map((d) => ({ id: `${d.screen}-drag`, width, screen: d.screen, act: (p) => drag(p, d) })) : []),
  ])
  for (const width of MOTION_WIDTHS) {
    const browser = await launch()
    try {
      const touch = width < 1280
      const ctx = await browser.newContext({ viewport: { width, height: HEIGHTS[width] ?? 900 }, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce', storageState: ids.storageState, bypassCSP: true, locale: 'en-GB', timezoneId: 'UTC' })
      await ctx.addInitScript((code) => { try { localStorage.setItem('opentodo.lang', code) } catch { /* storage blocked */ } }, 'en')
      const p = await ctx.newPage()
      p.on('dialog', (d) => d.dismiss())
      for (const m of moments.filter((x) => x.width === width)) {
        try {
          const host = hostOf({ kind: 'screen', layoutCheck: m.screen }, ids)
          await p.goto(base + host.path)
          await host.ready(p)
          if (host.layout) await chooseLayout(p, host.layout)
          await p.waitForTimeout(400)
          await installHelpers(p)
          await p.evaluate(watchMotion)
          await m.act(p)
          await p.waitForTimeout(400)
          out.push(...(await p.evaluate(motionSeen)).map((v) => ({ ...v, id: m.id, width })))
        } catch (err) {
          out.push({ rule: 'NAV', id: m.id, width, element: m.id, value: err.message.split('\n')[0].slice(0, 200), limit: 'opens' })
        }
        await p.keyboard.press('Escape').catch(() => {})
        if (m.screen === 'board') await chooseLayout(p, 'List').catch(() => {})
      }
    } finally {
      await browser.close()
    }
  }
  return out
}

// Each width completes its own task in Today (the account is shared by both passes);
// 360 px runs last and keeps "Renew passport", which Today's ready check looks for, until then.
const MOTION_WIDTHS = [1280, 360]
/** The drags M15 watches: a card to the next column, a Plan task to the next day, a Week block down an hour. */
const DRAGS = [
  { screen: 'board', from: '[data-column] [data-task-id]', to: (p) => p.locator('[data-column]').nth(1) },
  { screen: 'plan', from: '[data-plan-task]', to: (p) => p.locator('[data-plan-day]').nth(1) },
  { screen: 'week', from: '[data-block]', to: (p, box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 + 60 }) },
]
async function drag(p, d) {
  const source = p.locator(d.from).first()
  const box = await source.boundingBox()
  if (!box) throw new Error(`nothing to drag on ${d.screen}`)
  const target = d.to(p, box)
  const tb = typeof target.boundingBox === 'function' ? await target.boundingBox() : null
  const to = tb ? { x: tb.x + tb.width / 2, y: tb.y + Math.min(tb.height / 2, 80) } : target
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await p.mouse.down()
  await p.mouse.move(to.x, to.y, { steps: 12 })
  await p.waitForTimeout(150)
  await p.mouse.up()
}

/** M13: load Inbox, Today and a project online, stop the server, reload and time the first task row. */
async function firstInteraction(ids) {
  const browser = await launch()
  const out = []
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: ids.storageState, locale: 'en-GB', timezoneId: 'UTC' })
    const p = await ctx.newPage()
    const targets = [['inbox', '/inbox'], ['today', '/today'], ['project', `/project/${ids.home}`]]
    for (const [, path] of targets) { await p.goto(base + path); await p.locator('[data-task-id]').first().waitFor({ timeout: 30000 }) }
    await p.waitForTimeout(1500)
    stopServer()
    await new Promise((r) => server.exitCode === null ? server.once('exit', r) : r())
    for (const [id, path] of targets) {
      const t0 = Date.now()
      let ms = null
      try {
        await p.goto(base + path, { timeout: 15000 })
        await p.locator('[data-task-id]').first().waitFor({ timeout: 15000 })
        ms = Date.now() - t0
      } catch { /* not rendered offline */ }
      await p.screenshot({ path: join(OUT, `shots/offline-${id}.jpg`), type: 'jpeg', quality: 55 }).catch(() => {})
      out.push({ id, ms, shot: `shots/offline-${id}.jpg` })
    }
  } finally {
    await browser.close()
  }
  return out
}

// ---------------------------------------------------------------- main
const started = new Date().toISOString()
log('· seeding', base)
const ids = await seed({ base, pw })
const captures = []
for (const lang of LANGS) {
  await setLanguage(ids, lang)
  const combos = WIDTHS.flatMap((width) => THEMES.map((theme) => ({ width, theme, lang })))
  log(`· ${lang}: ${combos.length} combinations × ${tourable.length} entries`)
  const queue = [...combos]
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) captures.push(...await runCombo(queue.shift(), ids))
  }))
}
await setLanguage(ids, LANGS[0])
// M16: an overflow or truncation found in a later language and not in the first is that language's own.
const firstLang = new Set(captures.filter((c) => c.lang === LANGS[0]).flatMap((c) => c.violations.map((v) => `${c.id}|${c.width}|${c.theme}|${v.rule}`)))
for (const c of captures) {
  if (c.lang === LANGS[0]) continue
  for (const v of c.violations) if ((v.rule === 'M6' || v.rule === 'M10') && !firstLang.has(`${c.id}|${c.width}|${c.theme}|${v.rule}`)) v.languageOnly = true
}
const motion = A11Y_ONLY ? [] : await reducedMotion(ids)
const stories = coverage()
const extra = [
  ...motion,
  ...stories.missing.map((m) => ({ rule: 'M14', id: m.id, element: m.story ?? '(no story named)', detail: 'core screen without a story' })),
]
const timings = A11Y_ONLY || (ONLY && !['inbox', 'today', 'project'].some((id) => ONLY.has(id))) ? [] : await firstInteraction(ids)
ids.llm?.close()
const report = {
  run: { started, finished: new Date().toISOString(), widths: WIDTHS, themes: THEMES, langs: LANGS, entries: tourable.length },
  strict: STRICT,
  captures,
  reducedMotion: motion,
  firstInteraction: timings,
  storyCoverage: stories,
  summary: summarize(captures, entries, A11Y_ONLY ? [] : extra),
}
writeReport(OUT, report, entries)
log(`\n${captures.length} captures; ${report.summary.ranked.length} findings`)
for (const f of report.summary.ranked.slice(0, 10)) log(`  ${f.score}  ${f.rule} ${f.id}: ${f.element} (${f.count})`)
log(`\nreport: ${join(OUT, 'index.html')}`)
const strictFailures = report.summary.ranked.filter((f) => STRICT_RULES.includes(f.rule))
if (STRICT && !A11Y_ONLY && strictFailures.length) {
  console.error(`✗ strict mode: ${strictFailures.length} budget, overflow, story-coverage or reduced-motion findings`)
  process.exit(1)
}
// The accessibility gate names each failure with its screen, width, theme and language.
const a11yFailures = captures.flatMap((c) => c.violations.filter((v) => A11Y_RULES.includes(v.rule)).map((v) => ({ ...v, at: `${c.id} ${c.width}px ${c.theme} ${c.lang}` })))
if (A11Y && a11yFailures.length) {
  console.error(`\n✗ accessibility gate: ${a11yFailures.length} findings`)
  for (const f of a11yFailures) console.error(`  ${f.at}  ${f.rule} ${f.value}: ${f.element}${f.detail ? ` (${f.detail})` : ''}`)
  process.exit(1)
}
process.exit(0)
