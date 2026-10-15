// Browser check of the documentation website (OpenSpec change `user-documentation`,
// tasks 3.1, 3.2 and 5.1): builds the docs site into dist/docs-root/docs, serves it
// on a local port and, for a sample of
// docs pages at 360, 390 and 1280 px in light and dark,
//   - fails on sideways scrolling of the page,
//   - runs axe-core and fails on serious or critical issues,
//   - checks the search finds "recurring" in the recurring and quick add guides,
//     announces the result count and opens a result with Enter,
//   - checks every page with JavaScript off: content, navigation and links work,
//     the search form is hidden.
//
//   node scripts/e2e-docs.mjs [report-dir]      (default: docs-report)
//
// Needs Playwright with Chromium (CHROMIUM_PATH for another binary) and axe-core
// (web/node_modules after `npm ci` in web/, or a global install).
const pw = await import('playwright').catch(async () => {
  const { createRequire } = await import('node:module')
  const { execSync } = await import('node:child_process')
  return createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')
})
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { extname, join, normalize } from 'node:path'

const outDir = process.argv[2] ?? 'docs-report'
mkdirSync(outDir, { recursive: true })
const ROOT = 'dist/docs-root'
// The site is built, not committed (site-bundle D6): build it where /docs/ resolves,
// with the two icons the website serves next to it.
execSync('node web/scripts/docs/build.mjs --site dist/docs-root/docs', { stdio: 'inherit' })
mkdirSync(join(ROOT, 'assets'), { recursive: true })
for (const f of ['favicon.svg', 'apple-touch-icon.png']) copyFileSync(join('web/public', f), join(ROOT, 'assets', f))
const PAGES = (process.env.PAGES ?? '/docs/,/docs/getting-started/,/docs/sections-and-boards/,/docs/keyboard/,/docs/self-hosting/docker/,/docs/api/').split(',')
const WIDTHS = (process.env.WIDTHS ?? '360,390,1280').split(',').map(Number)
const THEMES = ['light', 'dark']

function axeSource() {
  try { return readFileSync(createRequire(new URL('../web/package.json', import.meta.url)).resolve('axe-core/axe.min.js'), 'utf8') } catch { /* global */ }
  return readFileSync(join(execSync('npm root -g').toString().trim(), 'axe-core/axe.min.js'), 'utf8')
}
const AXE = axeSource()

// A static server like the website's nginx: /docs/<page>/ serves index.html.
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' }
const server = createServer((req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  let file = join(ROOT, path)
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!existsSync(file)) { res.writeHead(404); res.end('not found'); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
})
await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
const base = `http://127.0.0.1:${server.address().port}`

const failures = []
const fail = async (p, where, msg) => {
  failures.push(`${where}: ${msg}`)
  await p.screenshot({ path: `${outDir}/${where.replace(/[^a-z0-9]+/gi, '_')}.png`, fullPage: false }).catch(() => {})
}
const browser = await pw.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
// Third-party requests (fonts, analytics) are blocked: the pages must not depend on them.
const block = (ctx) => ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort())

for (const width of WIDTHS) for (const theme of THEMES) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme })
  await block(ctx)
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message))
  for (const path of PAGES) {
    const where = `${path} ${width}px ${theme}`
    await p.goto(base + path)
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (overflow > 1) await fail(p, where, `the page scrolls sideways by ${overflow}px`)
    await p.addScriptTag({ content: AXE })
    const result = await p.evaluate(async () => {
      // eslint-disable-next-line no-undef
      const r = await axe.run(document, { resultTypes: ['violations'] })
      return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')})`)
    })
    for (const m of result) await fail(p, where, `axe ${m}`)
  }
  for (const e of errors) failures.push(`${width}px ${theme}: page error ${e}`)

  // Search: type, results announced, Enter on a result opens it.
  const where = `search ${width}px ${theme}`
  await p.goto(base + '/docs/')
  const input = p.locator('form[data-search] input:visible').first()
  await input.click()
  await input.fill('recurring')
  const results = p.locator('.search-results:visible a')
  try {
    await results.first().waitFor({ timeout: 5000 })
    const urls = await results.evaluateAll((as) => as.map((a) => a.getAttribute('href')))
    if (!urls.some((u) => u.startsWith('/docs/recurring-and-reminders/'))) await fail(p, where, `"recurring" did not find the recurring guide (${urls.join(', ')})`)
    if (!urls.some((u) => u.startsWith('/docs/quick-add/') || u.startsWith('/docs/recurrence/'))) await fail(p, where, `"recurring" did not find the quick add or rule reference (${urls.join(', ')})`)
    const status = await p.locator('form[data-search]:visible [data-search-status]').first().textContent()
    if (!/\d+ results?/.test(status ?? '')) await fail(p, where, `result count not announced (got "${status}")`)
    await input.press('ArrowDown')
    const focused = await p.evaluate(() => document.activeElement?.closest('.search-results') !== null)
    if (!focused) await fail(p, where, 'the down arrow does not reach the results')
    const target = await p.evaluate(() => document.activeElement?.getAttribute('href'))
    await p.keyboard.press('Enter')
    await p.waitForURL((u) => u.pathname + u.hash === target, { timeout: 5000 })
  } catch (e) {
    await fail(p, where, `search failed: ${e.message.split('\n')[0]}`)
  }
  await ctx.close()
}

// JavaScript off: every sample page renders with navigation; search is hidden.
const nojs = await browser.newContext({ viewport: { width: 390, height: 900 }, javaScriptEnabled: false })
await block(nojs)
const np = await nojs.newPage()
for (const path of PAGES) {
  const where = `${path} no-JS`
  await np.goto(base + path)
  if (!(await np.locator('h1').first().isVisible())) await fail(np, where, 'no visible heading')
  if (await np.locator('form[data-search]:visible').count()) await fail(np, where, 'search form shown without JavaScript')
  if (path !== '/docs/') {
    await np.locator('.docs-menu summary').click()
    const links = await np.locator('.docs-menu nav a').count()
    if (links < 10) await fail(np, where, `menu shows only ${links} links`)
    const next = np.locator('a[rel="next"]')
    if (await next.count()) {
      const href = await next.getAttribute('href')
      await next.click()
      if (new URL(np.url()).pathname !== href) await fail(np, where, 'next link does not navigate')
    }
  }
}
await nojs.close()
await browser.close()
server.close()
if (failures.length) {
  console.log(`\n✗ ${failures.length} docs site problems (screenshots in ${outDir}/):`)
  for (const f of failures) console.log('  -', f)
  process.exit(1)
}
console.log(`DOCS SITE OK: ${PAGES.length} pages × ${WIDTHS.length} widths × 2 themes, search, no-JS`)
