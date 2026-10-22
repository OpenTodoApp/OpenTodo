// Accessibility gate (OpenSpec design-system "Accessibility gate on stories"): opens
// every workbench story from the static build in Chromium, in light and dark, runs
// axe-core with the WCAG 2.2 A, AA and AAA rules and fails on any serious or critical
// violation, naming the story, theme and rule; an enhanced-contrast finding passes only
// when its colours resolve to a pair of the accessibility exceptions register
// (OpenSpec accessibility "Automated AAA gate", accessibility-aaa D12). On the
// core-screen stories (`Screens/*`) it then moves keyboard focus through every
// focusable element and fails on one that shows no focus ring or is partly hidden
// (design-system "Focus visibility in the accessibility gate"; the audit's M8 and M12),
// and measures the hit area of every pointer target (accessibility "Pointer targets";
// M11), each pass with its own shrinking exemption list under scripts/ux-audit/. The
// phone stories (`Screens/Phone`, the shell's phone scrolling) run a third time at 375 px,
// where the tab bar, the add button and the sticky page header meet the focused row
// (accessibility "Focus is never obscured", task 5.2).
//
//   cd web && npm run build-storybook && node ../scripts/ui-check/a11y.mjs
//
// Env: STORYBOOK_DIR (default web/storybook-static), ONLY (comma-separated story ids),
// CONCURRENCY (pages checked at once, default 4; every story still gets its own page).
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { loadPlaywright, serveStatic, storyIds } from './serve.mjs'
import { focusWalk, hitAreas, installHelpers } from '../ux-audit/audit-measures.mjs'
import { applyExempt, readExempt } from './exempt.mjs'
import { registeredColours } from './register.mjs'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const root = process.env.STORYBOOK_DIR ?? `${repo}web/storybook-static`
const AXE = readFileSync(createRequire(`${repo}web/package.json`).resolve('axe-core/axe.min.js'), 'utf8')
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'wcag2aaa', 'wcag21aaa', 'wcag22aaa']
// The resolved colours of every registered pair, per theme (design D12): an
// enhanced-contrast node whose colours both lie within ΔE 2 of a pair passes.
const REGISTERED = await registeredColours(`${repo}web/src/index.css`, `${repo}web/src/ui/a11y/exceptions.json`)

const { chromium } = await loadPlaywright()
const server = await serveStatic(root)
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null
const ids = (await storyIds(root)).filter((id) => !only || only.has(id))
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const failures = []
// Elements of the first run of each pass, each fixed by a follow-up that removes it from its list.
const FOCUS_EXEMPT = readExempt(`${repo}scripts/ux-audit/focus-exempt.json`)
const OBSCURED_EXEMPT = readExempt(`${repo}scripts/ux-audit/focus-obscured-exempt.json`)
const TARGET_EXEMPT = readExempt(`${repo}scripts/ux-audit/target-exempt.json`)
let exempted = 0
let registered = 0
const DESKTOP = { width: 1280, height: 900 }
const PHONE = { width: 375, height: 812 }
const onPhone = (id) => /^screens-(shell--phonescrolling|phone--)/.test(id)
const queue = ids.flatMap((id) => [[id, 'light', DESKTOP], [id, 'dark', DESKTOP], ...(onPhone(id) ? [[id, 'light', PHONE], [id, 'dark', PHONE]] : [])])
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY ?? 4))

async function check(id, theme, viewport) {
  const page = await browser.newPage({ viewport })
  const label = `${id} [${theme}${viewport === PHONE ? ' 375px' : ''}]`
  await page.goto(`${server.url}/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`)
  await page.waitForFunction(() => document.querySelector('#storybook-root')?.childElementCount > 0, null, { timeout: 15000 })
  // A Screens story seeds its data after it mounts (rows, counts, section totals arrive a
  // moment later); measuring earlier reads an empty list and names its controls without
  // their counts. Wait until the DOM has been quiet for 400 ms, 4 s at most.
  await page.evaluate(() => new Promise((resolve) => {
    let quiet = setTimeout(done, 400)
    const observer = new MutationObserver(() => { clearTimeout(quiet); quiet = setTimeout(done, 400) })
    const cap = setTimeout(done, 4000)
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true })
    function done() { clearTimeout(quiet); clearTimeout(cap); observer.disconnect(); resolve() }
  }))
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
      .map((v) => ({
        id: v.id, impact: v.impact, help: v.help,
        nodes: v.nodes.map((n) => ({
          target: n.target.join(' '),
          // The enhanced-contrast rule reports the measured colours and ratio per node.
          data: (n.any.find((c) => c.id === 'color-contrast-enhanced') ?? n.any[0])?.data ?? null,
          // A row while it is being dragged is lifted at 90 % opacity for the moment of the
          // drag (motion-v2): transient feedback, not text to read; the statement says so.
          dragging: !!document.querySelector(n.target.join(' '))?.closest('[data-dragging]'),
        })),
      }))
  }, TAGS)
  for (const v of violations) {
    let nodes = v.nodes
    if (v.id === 'color-contrast-enhanced') {
      const kept = []
      for (const n of nodes) {
        if (n.dragging) continue
        if (n.data?.fgColor && n.data?.bgColor && REGISTERED.covers(theme, n.data.fgColor, n.data.bgColor)) { registered++; continue }
        kept.push(n)
      }
      nodes = kept
      if (!nodes.length) continue
      const detail = nodes.slice(0, 3).map((n) => `${n.target}${n.data?.contrastRatio ? ` ${Number(n.data.contrastRatio).toFixed(2)}:1` : ''}`).join(', ')
      failures.push(`${label}: ${v.impact} ${v.id}: ${v.help}; not in the exceptions register (${detail})`)
      continue
    }
    failures.push(`${label}: ${v.impact} ${v.id}: ${v.help} (${nodes.slice(0, 3).map((n) => n.target).join(', ')})`)
  }
  if (id.startsWith('screens-')) {
    await installHelpers(page)
    // Hit areas first, on the story as it opened: the focus walk scrolls the page and may
    // leave rows under a sticky header, which is the obscured-focus pass's business.
    const hits = applyExempt(TARGET_EXEMPT, await page.evaluate(hitAreas))
    exempted += hits.exempt.length
    for (const f of hits.kept) failures.push(`${label}: hit area under 44 px (${f.value}): ${f.element}`)
    const walk = await focusWalk(page)
    const ring = applyExempt(FOCUS_EXEMPT, walk.filter((f) => f.rule === 'M8'))
    exempted += ring.exempt.length
    for (const f of ring.kept) failures.push(`${label}: focus without the ring: ${f.element}`)
    const obscured = applyExempt(OBSCURED_EXEMPT, walk.filter((f) => f.rule === 'M12'))
    exempted += obscured.exempt.length
    for (const f of obscured.kept) failures.push(`${label}: focus obscured, ${f.value}: ${f.element}`)
  }
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
console.log(`UI a11y check: ${ids.length} stories × 2 themes (${ids.filter(onPhone).length} phone stories also at 375 px) at the A, AA and AAA rules (${registered} enhanced-contrast findings matched the exceptions register); focus ring, focus never obscured and a 44 px hit area on every element of the Screens stories (${exempted} listed in the scripts/ux-audit/*-exempt.json lists)`)
