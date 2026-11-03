// The 2,000-row list as a screen reader gets it (OpenSpec change accessibility-aa). The
// list keeps rows far from the viewport unrendered with `content-visibility: auto`
// (list-rendering-at-scale D1), and its rejected D4 would have split the list into
// blocks. Opens the perfseed account's 2,000-task project at 1280 px in Chromium with
// full accessibility on (--force-renderer-accessibility, the mode Chromium switches to
// when a screen reader is running) and reads the accessibility tree the platform API is
// built from: every row must be a list item with its Complete button in the tree, the
// items must sit in the list elements the page has (no list split into blocks), and the
// rows far below the viewport must be there as fully as the ones on screen.
//
//   PERF_FIXTURE=<perfseed data dir> node scripts/perf/a11y-list.mjs
//
// Env: PERF_BIN (bin/opentodo), CHROMIUM_PATH. Prints a summary; exits 1 with the problems.
const pw = await import('playwright').catch(async () => {
  const { createRequire } = await import('node:module')
  const { execSync } = await import('node:child_process')
  return createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')
})
import { spawn } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const FIXTURE = process.env.PERF_FIXTURE
if (!FIXTURE) throw new Error('PERF_FIXTURE: give a perfseed data directory (make perf makes one)')
const BIN = process.env.PERF_BIN ?? 'bin/opentodo'
const summary = JSON.parse(readFileSync(join(FIXTURE, 'perfseed.json'), 'utf8'))

const port = await new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port: p } = s.address(); s.close(() => ok(p)) }) })
const dir = mkdtempSync(join(tmpdir(), 'a11y-list-'))
copyFileSync(join(FIXTURE, 'opentodo.db'), join(dir, 'opentodo.db'))
const base = `http://127.0.0.1:${port}`
const server = spawn(BIN, [], { env: { ...process.env, OPENTODO_DATA_DIR: dir, OPENTODO_ADDR: `127.0.0.1:${port}`, OPENTODO_LOG_LEVEL: 'warn' }, stdio: 'ignore' })
process.on('exit', () => { server.kill(); rmSync(dir, { recursive: true, force: true }) })
for (let i = 0; i < 300; i++) {
  try { if ((await fetch(`${base}/healthz`)).ok) break } catch { /* starting */ }
  await new Promise((r) => setTimeout(r, 50))
}

const browser = await pw.chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  // Without an assistive technology Chromium builds the tree lazily and leaves the
  // contents of skipped rows out; with one running (or this flag) it exposes them.
  args: ['--force-renderer-accessibility'],
})
const problems = []
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' })
  const login = await ctx.request.post(`${base}/api/v1/auth/login`, { data: { email: summary.ownerEmail, password: summary.password } })
  if (!login.ok()) throw new Error(`login: ${login.status()}`)
  const page = await ctx.newPage()
  await page.goto(`${base}/today`)
  await page.waitForFunction(() => performance.getEntriesByName('ot:sync-idle').length > 0, null, { timeout: 300_000 })
  await page.goto(`${base}/project/${summary.bigProject}`)
  await page.locator('[data-task-id]').nth(50).waitFor({ timeout: 120_000 })
  // Every row drawn: the same count ten checks in a row (as scripts/perf/run.mjs waits).
  await page.waitForFunction(() => {
    const n = document.querySelectorAll('[data-task-id]').length
    if (n !== window.__rows) { window.__rows = n; window.__checks = 0; return false }
    return ++window.__checks >= 10
  }, null, { polling: 100, timeout: 120_000 })
  const dom = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('main [data-task-id]')]
    rows.forEach((r, i) => r.setAttribute('data-a11y-row', String(i)))
    return {
      rows: rows.length,
      lists: new Set(rows.map((r) => r.parentElement?.closest('ul, ol'))).size,
      // With an assistive technology on, Chromium renders skipped rows for it, so count the rule, not the skipping.
      autoRows: rows.filter((r) => getComputedStyle(r).contentVisibility === 'auto').length,
      lastBelow: rows.length > 0 && rows[rows.length - 1].getBoundingClientRect().top > innerHeight,
    }
  })
  const cdp = await ctx.newCDPSession(page)
  const { nodes } = await cdp.send('Accessibility.getFullAXTree')
  const byId = new Map(nodes.map((n) => [n.nodeId, n]))
  const role = (n) => n.role?.value
  const below = (n, out = []) => { for (const c of (n.childIds ?? []).map((id) => byId.get(id)).filter(Boolean)) { if (!c.ignored) out.push(c); below(c, out) } return out }
  // The tree's list items that are task rows (the DOM node carries the mark set above).
  const doc = await cdp.send('DOM.getDocument', { depth: 0 })
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: doc.root.nodeId, selector: '[data-a11y-row]' })
  const rowBackend = new Set()
  for (const id of nodeIds) rowBackend.add((await cdp.send('DOM.describeNode', { nodeId: id })).node.backendNodeId)
  const rowItems = nodes.filter((n) => !n.ignored && role(n) === 'listitem' && rowBackend.has(n.backendDOMNodeId))
  const empty = rowItems.filter((it) => !below(it).some((d) => role(d) === 'button' && /^(Complete|Reopen) /.test(d.name?.value ?? '')))
  const parents = new Set(rowItems.map((it) => { let p = byId.get(it.parentId); while (p && p.ignored) p = byId.get(p.parentId); return p?.nodeId }))
  const report = { domRows: dom.rows, rowsWithContentVisibilityAuto: dom.autoRows, lastRowBelowViewport: dom.lastBelow, listElements: dom.lists, treeRowItems: rowItems.length, treeListsOfRows: parents.size, unnamedLists: [...parents].filter((id) => !byId.get(id)?.name?.value).length, treeRowsWithoutTheirControls: empty.length }
  console.log(JSON.stringify(report, null, 1))
  if (rowItems.length !== dom.rows) problems.push(`the accessibility tree has ${rowItems.length} row items for ${dom.rows} rows`)
  if (empty.length) problems.push(`${empty.length} rows are in the tree without their Complete button`)
  if (dom.autoRows < dom.rows / 2 || !dom.lastBelow) problems.push('the rows do not use content-visibility: auto: this run did not check what it means to')
  if ([...parents].some((id) => !byId.get(id)?.name?.value)) problems.push('a list of rows has no name (its section or group heading)')
  if (parents.size > dom.lists) problems.push(`the rows sit in ${parents.size} lists in the tree for ${dom.lists} list elements (a split list)`)
} finally {
  await browser.close()
}
if (problems.length) { for (const p of problems) console.error('✗', p); process.exit(1) }
console.log('✓ every row of the 2,000-row list is in the accessibility tree, in one list per section')
process.exit(0)
