// Accessibility gate (OpenSpec design-system "Accessibility gate on stories"): opens
// every workbench story from the static build in Chromium, in light and dark, runs
// axe-core with the WCAG 2.2 AA rules and fails on any serious or critical violation,
// naming the story, theme and rule.
//
//   cd web && npm run build-storybook && node ../scripts/ui-check/a11y.mjs
//
// Env: STORYBOOK_DIR (default web/storybook-static), ONLY (comma-separated story ids),
// CONCURRENCY (pages checked at once, default 4; every story still gets its own page).
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { loadPlaywright, serveStatic, storyIds } from './serve.mjs'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const root = process.env.STORYBOOK_DIR ?? `${repo}web/storybook-static`
const AXE = readFileSync(createRequire(`${repo}web/package.json`).resolve('axe-core/axe.min.js'), 'utf8')
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

const { chromium } = await loadPlaywright()
const server = await serveStatic(root)
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null
const ids = (await storyIds(root)).filter((id) => !only || only.has(id))
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const failures = []
const queue = ids.flatMap((id) => [[id, 'light'], [id, 'dark']])
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY ?? 4))

async function check(id, theme) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(`${server.url}/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`)
  await page.waitForFunction(() => document.querySelector('#storybook-root')?.childElementCount > 0, null, { timeout: 15000 })
  // A story that changes a control's colour once its data arrives (the review's
  // "Finish review" turns primary when every step is done) is mid-transition for
  // 120 ms; axe would then measure a blended background and report a contrast
  // violation that no person can see. Finish every transition before measuring.
  await page.addStyleTag({ content: '*, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; }' })
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.addScriptTag({ content: AXE })
  const violations = await page.evaluate(async (tags) => {
    // The a11y addon may still be running its own pass in the iframe; axe refuses to overlap, so wait for it.
    let r
    for (let attempt = 0; ; attempt++) {
      try {
        // eslint-disable-next-line no-undef
        r = await axe.run('#storybook-root', { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })
        break
      } catch (err) {
        if (attempt >= 20 || !String(err).includes('already running')) throw err
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
    }
    return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')})`)
  }, TAGS)
  for (const v of violations) failures.push(`${id} [${theme}]: ${v}`)
  await page.close()
}

// A few pages at once: each check is mostly waiting on the browser, and the stories are independent.
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
  for (let next = queue.shift(); next; next = queue.shift()) await check(...next)
}))
failures.sort()

await browser.close()
server.close()
if (failures.length) {
  console.error(`UI a11y check: ${failures.length} problem(s)\n${failures.map((f) => `  - ${f}`).join('\n')}`)
  process.exit(1)
}
console.log(`UI a11y check: ${ids.length} stories × 2 themes, no serious or critical violations`)
