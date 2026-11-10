// The browser half of the time benchmark of the performance budgets (OpenSpec
// change performance-10k, design D3): a scripted session on the 10,000-task
// fixture in Chromium, on desktop and in the phone profile (4x CPU throttling,
// 412x915), five runs each; the median of each metric is compared with
// scripts/perf/budgets.json and any excess fails.
//
//   node scripts/perf/run.mjs          (make perf runs it after the fixture and the server)
//
// Env: PERF_BIN (default bin/opentodo), PERF_FIXTURE (a perfseed data directory, required;
// with PERF_NOTES=1 the compacted notes fixture TestNotesBudgets leaves),
// PERF_RUNS (default 5), PERF_PROFILES (default "desktop,phone"), PERF_REPORT (default
// perf-report/web.json), PERF_ONLY (metric ids, comma-separated: the session stops once
// it has them and only they are judged, for a quick look at one regression), CHROMIUM_PATH.
//
// The app's measurement points are performance.mark entries (web/src/lib/perfMarks.ts):
// they never leave the browser, and this run checks that every request goes to the
// local server only.
const { chromium } = await import('playwright').catch(async () => {
  const { createRequire } = await import('node:module')
  const { execSync } = await import('node:child_process')
  return createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')
})
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { evaluate, loadBudgets, median } from './budgets.mjs'

const BIN = process.env.PERF_BIN ?? 'bin/opentodo'
// PERF_NOTES=1: the notes fixture's session (the compacted copy TestNotesBudgets leaves) instead of the 10k one.
const NOTES = !!process.env.PERF_NOTES
const FIXTURE = process.env.PERF_FIXTURE
if (!FIXTURE) throw new Error('PERF_FIXTURE: give a perfseed data directory (make perf makes one)')
const RUNS = Number(process.env.PERF_RUNS ?? 5)
const PROFILES = (process.env.PERF_PROFILES ?? 'desktop,phone').split(',').filter(Boolean)
const REPORT = process.env.PERF_REPORT ?? 'perf-report/web.json'
const ONLY = (process.env.PERF_ONLY ?? '').split(',').filter(Boolean)
/** With PERF_ONLY, whether the session has every metric asked for and can stop. */
const enough = (out) => ONLY.length > 0 && ONLY.every((id) => id in out)
const summary = JSON.parse(readFileSync(join(FIXTURE, 'perfseed.json'), 'utf8'))
const log = (s) => console.log('·', s)
const debug = process.env.PERF_DEBUG ? (s) => console.log('  ', new Date().toISOString().slice(11, 23), s) : () => {}

const profiles = {
  desktop: { viewport: { width: 1280, height: 800 }, throttle: 1 },
  phone: { viewport: { width: 412, height: 915 }, throttle: 4, isMobile: true, hasTouch: true, deviceScaleFactor: 2.625 },
}

async function freePort() {
  return new Promise((ok, fail) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)) })
    s.on('error', fail)
  })
}

/** A server on a fresh copy of the fixture. */
async function startServer() {
  const dir = mkdtempSync(join(tmpdir(), 'perf-'))
  copyFileSync(join(FIXTURE, 'opentodo.db'), join(dir, 'opentodo.db'))
  const port = await freePort()
  const base = `http://127.0.0.1:${port}`
  const proc = spawn(BIN, [], { env: { ...process.env, OPENTODO_DATA_DIR: dir, OPENTODO_ADDR: `127.0.0.1:${port}`, OPENTODO_LOG_LEVEL: 'warn' }, stdio: ['ignore', 'ignore', 'inherit'] })
  for (let i = 0; i < 300; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) break } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 50))
  }
  return { base, stop: async () => { proc.kill('SIGTERM'); await new Promise((r) => proc.once('exit', r)); rmSync(dir, { recursive: true, force: true }) } }
}

// Installed before the app loads: long tasks, the browser's Event Timing entries
// of interactions (the INP measurement, below), and the time of each input event
// (the start of a "to the next paint" measurement).
function instrument() {
  window.__perf = { longtasks: [], events: [], lastInput: 0 }
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.longtasks.push({ start: e.startTime, duration: e.duration }) }).observe({ type: 'longtask', buffered: true })
  } catch { /* no long task API */ }
  // Every event of an interaction (pointerdown, pointerup, click; keydown, keyup) that took
  // 16 ms or more, the smallest threshold the API allows; shorter ones are not reported.
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.interactionId) window.__perf.events.push({ name: e.name, id: e.interactionId, start: e.startTime, duration: e.duration })
    }).observe({ type: 'event', durationThreshold: 16, buffered: true })
  } catch { /* no Event Timing: interaction() refuses to measure */ }
  for (const type of ['keydown', 'pointerdown', 'click']) addEventListener(type, (e) => { if (type !== 'click' || !window.__perf.lastInput) window.__perf.lastInput = e.timeStamp }, true)
}

/** Waits, in the page, for a mark newer than `after` (ms on the page's clock) and returns its time. */
async function markAfter(page, name, after, timeout = 180_000) {
  return page.waitForFunction(([n, a]) => {
    const e = performance.getEntriesByName(n).filter((x) => x.startTime > a).at(-1)
    return e ? e.startTime : false
  }, [name, after], { timeout, polling: 20 }).then((h) => h.jsonValue())
}

/**
 * Times an input to the frame that shows its effect: `trigger` sends the input;
 * the effect is in the DOM once `present` matches an element, or `gone` matches
 * none. The result runs from the input event to the end of the next frame after that.
 */
async function toNextPaint(page, trigger, { present, gone }) {
  await page.evaluate(([present, gone]) => {
    window.__perf.lastInput = 0
    window.__perf.wait = new Promise((resolve) => {
      const seen = () => (!!present && !!document.querySelector(present)) || (!!gone && !document.querySelector(gone))
      const done = () => requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - window.__perf.lastInput), 0))
      const mo = new MutationObserver(() => { if (window.__perf.lastInput && seen()) { mo.disconnect(); window.__perf.seenAt = performance.now(); done() } })
      mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
    })
  }, [present ?? null, gone ?? null])
  await trigger()
  return page.evaluate(() => Promise.race([window.__perf.wait, new Promise((r) => setTimeout(() => r(null), 60_000))]))
}

/**
 * Times an input as the web measures responsiveness (Interaction to Next Paint):
 * the browser's Event Timing entries of the interaction the input starts, each
 * running from the input to the next paint after its handlers ran (processing
 * plus presentation), and the longest of them, as INP takes per interaction.
 * An interaction with no entry took under the 16 ms threshold and counts as 16.
 *
 * Returns { ms, frame, ... }: `frame` is toNextPaint's timer of the same input (to
 * the frame after the change, then a task), reported beside it for a release or two.
 * When the change was not yet in the document at the interaction's paint (it came
 * in a later frame), that paint did not show the result: `late` is set and `ms` is
 * the timer's value instead.
 */
async function interaction(page, trigger, wait) {
  const t0 = await page.evaluate(() => {
    if (!PerformanceObserver.supportedEntryTypes?.includes('event')) throw new Error('this browser has no Event Timing (PerformanceObserver type "event")')
    window.__perf.seenAt = 0
    return performance.now()
  })
  const frame = await toNextPaint(page, trigger, wait)
  if (frame === null) return null
  // The entries are queued once the paint is presented, a frame or two after it.
  return page.evaluate(([t0, frame]) => new Promise((resolve) => {
    const until = performance.now() + 1000
    const look = () => {
      // From the input that started the measurement on (an entry's start is its event's timeStamp):
      // an earlier input after t0 (one run on CI logged one 255 ms before the click) is not this interaction.
      const from = Math.max(t0, window.__perf.lastInput - 1)
      const mine = window.__perf.events.filter((e) => e.start >= from)
      if (!mine.length && performance.now() < until) return void setTimeout(look, 20)
      const seen = window.__perf.seenAt
      if (!mine.length) return resolve({ ms: 16, frame, seen: seen - t0 })
      const top = mine.reduce((a, e) => (e.duration > a.duration ? e : a))
      // The interaction's last paint; duration is rounded to 8 ms, so it ended within 8 ms of start + duration.
      const late = seen > Math.max(...mine.map((e) => e.start + e.duration)) + 8
      resolve({ ms: late ? frame : top.duration, frame, late, event: top.name, interactions: new Set(mine.map((e) => e.id)).size, seen: seen - top.start, paint: top.duration, entries: mine.map((e) => `${e.name}@${Math.round(e.start - t0)}+${e.duration}`).join(' ') })
    }
    look()
  }), [t0, frame])
}

/** SPA navigation, as a link click does it; returns the page time it started. */
async function go(page, path) {
  return page.evaluate((p) => { const t0 = performance.now(); history.pushState(null, '', p); dispatchEvent(new PopStateEvent('popstate')); return t0 }, path)
}

const p95 = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.max(0, Math.ceil(s.length * 0.95) - 1)] }

let current = null

async function session(browser, profileName) {
  const prof = profiles[profileName]
  const server = await startServer()
  const out = {}
  const foreign = []
  const ctx = await browser.newContext({ viewport: prof.viewport, isMobile: prof.isMobile, hasTouch: prof.hasTouch, deviceScaleFactor: prof.deviceScaleFactor, serviceWorkers: 'block' })
  try {
    await ctx.addInitScript(instrument)
    ctx.on('request', (r) => {
      const u = new URL(r.url())
      if (u.origin !== server.base && u.protocol !== 'data:' && u.protocol !== 'blob:') foreign.push(r.url())
      if (/ot:(list-ready|search-results|sync-idle|remote-applied)/.test(r.url() + (r.postData() ?? ''))) foreign.push('a request carries a measurement mark: ' + r.url())
    })
    const login = await ctx.request.post(`${server.base}/api/v1/auth/login`, { data: { email: summary.ownerEmail, password: summary.password } })
    if (!login.ok()) throw new Error(`login: ${login.status()} ${await login.text()}`)
    const page = await ctx.newPage()
    current = page
    page.on('console', (m) => debug(`console ${m.type()}: ${m.text()}`))
    const cdp = await ctx.newCDPSession(page)
    if (prof.throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.throttle })

    debug('First sync of a new device')
    // First sync of a new device: from the navigation to everything pulled.
    await page.goto(`${server.base}/today`)
    const synced = await markAfter(page, 'ot:sync-idle', 0, 300_000)
    out['first-sync'] = synced / 1000
    out['first-sync-long-task'] = await page.evaluate((end) => Math.max(0, ...window.__perf.longtasks.filter((t) => t.start < end).map((t) => t.duration)), synced)
    const local = await page.evaluate(() => new Promise((ok, fail) => {
      const req = indexedDB.open('opentodo')
      req.onerror = () => fail(req.error)
      req.onsuccess = () => { const c = req.result.transaction('tasks').objectStore('tasks').count(); c.onsuccess = () => { ok(c.result); req.result.close() } }
    }))
    if (local < summary.counts.task) throw new Error(`first sync: ${local} tasks local, the fixture has ${summary.counts.task}`)
    out.indexeddb = await page.evaluate(async () => (await navigator.storage.estimate()).usage / 2 ** 20)

    debug('Cold start with the data local')
    // Cold start with the data local: a reload, to the Today list.
    await page.reload()
    out['cold-start'] = await markAfter(page, 'ot:list-ready', 0)
    if (enough(out)) return out
    await page.waitForTimeout(1000) // the start-up sync settles

    debug('Open the 2,000-task project')
    // Open the 2,000-task project.
    let t0 = await go(page, `/project/${summary.bigProject}`)
    out['open-project'] = (await markAfter(page, 'ot:list-ready', t0)) - t0
    if (enough(out)) return out
    await page.locator('[data-task-id]').nth(50).waitFor()
    // A long list draws its rows a step at a time after the first frame: the
    // interactions below run once all of them are in the document.
    // Ten checks in a row with the same count: a step that held the page for a
    // second (the phone profile) looked like a second without a step, and the cursor
    // and the completions then ran while rows were still being drawn (list-rendering-at-scale).
    await page.waitForFunction(() => {
      const n = document.querySelectorAll('[data-task-id]').length
      const w = window.__perf
      if (n !== w.rowCount) { w.rowCount = n; w.rowChecks = 0; return false }
      return ++w.rowChecks >= 10
    }, null, { polling: 100, timeout: 60_000 })

    debug('Cursor moves in that list')
    // Cursor moves in that list.
    const moves = []
    for (let i = 0; i < 12; i++) {
      const prev = await page.evaluate(() => document.querySelector('li[data-task-id][aria-current="true"]')?.getAttribute('data-task-id') ?? '')
      const ms = await toNextPaint(page, () => page.keyboard.press('j'), { present: `li[data-task-id][aria-current="true"]:not([data-task-id="${prev}"])` })
      if (i > 0 && ms !== null) moves.push(ms) // the first press only selects
    }
    if (moves.length < 5) throw new Error('cursor moves: the selection did not move')
    out['cursor-move'] = p95(moves)

    debug('Complete ten tasks in the list')
    // Complete ten tasks in the list.
    const completes = []
    const completeFrames = []
    // Tasks without a series or subtasks, so one click completes them; on screen, past the top rows.
    const shown = await page.evaluate(() => [...document.querySelectorAll('li[data-task-id]')].map((li) => li.getAttribute('data-task-id')))
    const targets = shown.slice(10).filter((id) => summary.plainTasks.includes(id)).slice(0, 10)
    if (targets.length < 10) throw new Error(`complete: only ${targets.length} plain tasks on screen`)
    for (const id of targets) {
      const row = page.locator(`li[data-task-id="${id}"]`)
      const r = await interaction(page, () => row.locator('button[aria-label^="Complete"]').first().click(), { present: `li[data-task-id="${id}"] [data-check-mark] svg`, gone: `li[data-task-id="${id}"]` })
      if (r === null) throw new Error('complete: the row did not change')
      debug(`completion ${JSON.stringify(r)}`)
      if (r.late) log(`${profileName} completion: the tick was not in the interaction's paint (in the document ${Math.round(r.seen)} ms after the input, paint at ${r.paint} ms); the timer's ${Math.round(r.frame)} ms counts`)
      completes.push(r.ms)
      completeFrames.push(r.frame)
    }
    // Every sample in order, in the log: the p95 of ten is their largest, and which one it is (the first, or one behind a sync) says where to look.
    log(`${profileName} completions, interaction: ${completes.map(Math.round).join(', ')}; timer: ${completeFrames.map(Math.round).join(', ')}; cursor moves: ${moves.map(Math.round).join(', ')}`)
    out['complete-task'] = p95(completes)
    out['complete-task-frame'] = p95(completeFrames)
    if (enough(out)) return out

    debug('A remote edit')
    // A remote edit (another device, through the API) painted here over the live channel,
    // once the completions above are synced.
    await page.waitForTimeout(3000)
    const remote = []
    for (let i = 0; i < 3; i++) {
      const id = await page.locator('li[data-task-id]').nth(5 + i).getAttribute('data-task-id')
      const title = `Remote edit ${i} ${Date.now()}`
      // The page notes the wall-clock time of the frame after the new title shows:
      // Date.now(), as the sender's is. performance.timeOrigin + performance.now() is
      // a monotonic clock and ran 0.9 s ahead of the wall clock by then (list-rendering-at-scale).
      await page.evaluate((tt) => {
        window.__perf.remote = new Promise((resolve) => {
          const mo = new MutationObserver(() => {
            if (!document.body.textContent.includes(tt)) return
            mo.disconnect()
            requestAnimationFrame(() => setTimeout(() => resolve(Date.now()), 0))
          })
          mo.observe(document.body, { subtree: true, childList: true, characterData: true })
        })
      }, title)
      const sent = Date.now()
      const res = await fetch(`${server.base}/api/v1/tasks/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${summary.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) })
      if (!res.ok) throw new Error(`remote edit: ${res.status}`)
      const painted = await page.evaluate(() => Promise.race([window.__perf.remote, new Promise((r) => setTimeout(() => r(null), 30_000))]))
      if (painted === null) throw new Error('remote edit: never painted')
      remote.push(painted - sent)
    }
    debug(`remote edits: ${remote.map(Math.round).join(', ')}`)
    out['remote-edit'] = Math.max(...remote)

    debug('Saved view of eight clauses')
    // Saved view of eight clauses, from Today as the project above: leaving the
    // 2,000-row project first timed taking its rows down, not the view (list-rendering-at-scale).
    t0 = await go(page, '/today')
    await markAfter(page, 'ot:list-ready', t0)
    t0 = await go(page, `/view/${summary.view}`)
    out['saved-view'] = (await markAfter(page, 'ot:list-ready', t0)) - t0

    debug('Search keystrokes in the command bar')
    // Search keystrokes in the command bar.
    t0 = await go(page, '/today')
    await markAfter(page, 'ot:list-ready', t0)
    await page.keyboard.press('Control+k')
    await page.locator('[data-palette] input').waitFor()
    const keys = []
    for (const ch of [...summary.searchTerm, ...Array(summary.searchTerm.length - 1).fill('Backspace')]) {
      const before = await page.evaluate(() => performance.now())
      await page.keyboard.press(ch)
      const at = await markAfter(page, 'ot:search-results', before, 30_000).catch(() => null)
      const input = await page.evaluate(() => window.__perf.lastInput)
      if (at !== null) keys.push(at - input)
    }
    out['search-keystroke'] = p95(keys)
    await page.keyboard.press('Escape')

    debug('Memory after the session')
    // Memory after the session.
    await cdp.send('HeapProfiler.collectGarbage')
    out['js-heap'] = (await cdp.send('Runtime.getHeapUsage')).usedSize / 2 ** 20
    if (foreign.length) throw new Error('requests that did not go to the local server, or carried a mark:\n' + foreign.join('\n'))
    return out
  } catch (err) {
    mkdirSync(dirname(REPORT), { recursive: true })
    await current?.screenshot({ path: join(dirname(REPORT), `${profileName}-failure.png`) }).catch(() => {})
    throw err
  } finally {
    await ctx.close()
    await server.stop()
  }
}

/**
 * The notes fixture's session (design D7): a new device's first sync of the
 * compacted account, the storage it takes, the Notes page and a note search.
 */
async function notesSession(browser, profileName) {
  const prof = profiles[profileName]
  const server = await startServer()
  const out = {}
  const ctx = await browser.newContext({ viewport: prof.viewport, isMobile: prof.isMobile, hasTouch: prof.hasTouch, deviceScaleFactor: prof.deviceScaleFactor, serviceWorkers: 'block' })
  try {
    await ctx.addInitScript(instrument)
    const login = await ctx.request.post(`${server.base}/api/v1/auth/login`, { data: { email: summary.ownerEmail, password: summary.password } })
    if (!login.ok()) throw new Error(`login: ${login.status()}`)
    const page = await ctx.newPage()
    current = page
    const cdp = await ctx.newCDPSession(page)
    if (prof.throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.throttle })
    await page.goto(`${server.base}/today`)
    out['notes-first-sync'] = (await markAfter(page, 'ot:sync-idle', 0, 600_000)) / 1000
    const notes = await page.evaluate(() => new Promise((ok) => {
      const req = indexedDB.open('opentodo')
      req.onsuccess = () => { const c = req.result.transaction('notes').objectStore('notes').count(); c.onsuccess = () => { ok(c.result); req.result.close() } }
    }))
    if (notes < summary.notes.standalone) throw new Error(`notes: ${notes} local, the fixture has ${summary.notes.standalone}`)
    out['notes-indexeddb'] = await page.evaluate(async () => (await navigator.storage.estimate()).usage / 2 ** 20)
    await page.waitForTimeout(1000)
    const t0 = await go(page, '/notes')
    out['notes-page'] = (await markAfter(page, 'ot:list-ready', t0)) - t0
    const field = page.locator('[data-note-search]')
    await field.click()
    const keys = []
    for (const ch of 'kitchen') {
      const before = await page.evaluate(() => performance.now())
      await page.keyboard.press(ch)
      const at = await markAfter(page, 'ot:search-results', before, 30_000).catch(() => null)
      const input = await page.evaluate(() => window.__perf.lastInput)
      if (at !== null) keys.push(at - input)
    }
    out['notes-search'] = p95(keys)
    if (enough(out)) return out
    // note-links D5: a note other notes link to, opened before anything built the link index, to its Linked references painted.
    const t1 = await go(page, `/notes/${summary.notes.linkedNote}`)
    out['note-references'] = (await markAfter(page, 'ot:note-references', t1, 30_000)) - t1
    if (enough(out)) return out
    await cdp.send('HeapProfiler.collectGarbage')
    out['notes-js-heap'] = (await cdp.send('Runtime.getHeapUsage')).usedSize / 2 ** 20
    return out
  } catch (err) {
    mkdirSync(dirname(REPORT), { recursive: true })
    await current?.screenshot({ path: join(dirname(REPORT), `${profileName}-notes-failure.png`) }).catch(() => {})
    throw err
  } finally {
    await ctx.close()
    await server.stop()
  }
}

// Measured and reported beside the budgets, never held to a limit.
const REPORTED = {
  // The completion's timer before it was measured as an interaction (2026-11-06): from the
  // input to the frame after the row changed, then a task, so it also counts the browser's
  // work after that paint. Kept for a release or two so the two can be compared.
  'complete-task-frame': { name: 'complete a task, input to the frame after the change (the earlier timer), p95', unit: 'ms' },
}
const reported = (samples) => Object.entries(REPORTED).filter(([id]) => samples[id]?.length).map(([id, m]) => ({ id, ...m, runs: samples[id], median: Math.round(median(samples[id]) * 10) / 10 }))

const budgets = loadBudgets()
const isNotes = (id) => id.startsWith('notes-') || id === 'note-references'
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const reports = []
let failed = false
try {
  for (const name of PROFILES) {
    const samples = {}
    for (let i = 0; i < RUNS; i++) {
      const s = await (NOTES ? notesSession : session)(browser, name)
      for (const [k, v] of Object.entries(s)) (samples[k] ??= []).push(Math.round(v * 10) / 10)
      log(`${name} run ${i + 1}/${RUNS}: ${Object.entries(s).map(([k, v]) => `${k} ${Math.round(v * 10) / 10}`).join(', ')}`)
    }
    const rep = evaluate(budgets, name, samples, (id) => isNotes(id) === NOTES && (!ONLY.length || ONLY.includes(id)))
    if (NOTES) rep.setting = `${name} (notes)`
    rep.reported = reported(samples)
    reports.push(rep)
    for (const m of rep.reported) console.log(`info ${name.padEnd(8)} ${m.id.padEnd(22)} median ${String(m.median).padStart(8)} ${m.unit.padEnd(2)} reported, no budget`)
    for (const m of rep.metrics) {
      console.log(`${m.ok ? 'ok  ' : 'FAIL'} ${name.padEnd(8)} ${m.id.padEnd(22)} median ${String(m.median).padStart(8)} ${m.unit.padEnd(2)} budget ${m.limit}`)
      if (!m.ok) failed = true
    }
  }
} finally {
  await browser.close()
}
mkdirSync(dirname(REPORT), { recursive: true })
writeFileSync(REPORT, JSON.stringify(reports, null, 2) + '\n')
const failures = reports.flatMap((r) => r.metrics.filter((m) => !m.ok).map((m) => m.failure))
if (failed) {
  console.error('Over budget:\n' + failures.map((f) => '  ' + f).join('\n'))
  process.exit(1)
}
