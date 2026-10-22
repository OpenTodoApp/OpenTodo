// Browser tests of the audit's measurements over small HTML fixtures (OpenSpec
// change ux-audit-three-widths, tasks 2.2 to 2.4): one passing and one failing case
// per rule. Needs Playwright's Chromium (global install, CHROMIUM_PATH); skipped
// without it. Run: node --test scripts/ux-audit/measure.test.mjs
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chromeRows, focusWalk, horizontalOverflow, installHelpers, layoutShift, LAYOUT_SHIFT_INIT, movingAnimations,
  overlaps, primaryDestinations, rowMetaItems, targetSize, truncation,
} from './audit-measures.mjs'

const pw = await import('playwright').catch(async () => {
  const { createRequire } = await import('node:module')
  const { execSync } = await import('node:child_process')
  try { return createRequire(execSync('npm root -g').toString().trim() + '/')('playwright') } catch { return null }
})
let browser = null
try { browser = await pw?.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) } catch { browser = null }
const skip = browser ? false : 'Playwright Chromium is not installed'

let page
before(async () => { if (browser) page = await (await browser.newContext({ viewport: { width: 360, height: 640 } })).newPage() })
after(async () => { await browser?.close() })

async function fixture(html, opts = {}) {
  await page.setContent(`<!doctype html><html><head><style>body{margin:0;font:16px sans-serif} .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}</style></head><body>${html}</body></html>`)
  if (opts.reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' })
  await installHelpers(page)
}
const rules = (records) => records.map((r) => r.rule)

test('M2 chrome rows: two pass, three fail', { skip }, async () => {
  const list = (n) => `<div data-list-page>${'<div>chrome</div>'.repeat(n)}<ul><li data-task-id="a">Task</li></ul></div>`
  await fixture(list(2))
  assert.deepEqual(await page.evaluate(chromeRows, 2), [])
  await fixture(list(3))
  const r = await page.evaluate(chromeRows, 2)
  assert.deepEqual(r, [{ rule: 'M2', element: '[data-list-page]', value: 3, limit: 2 }])
})

test('M3 row metadata: five pass, six fail', { skip }, async () => {
  const row = (n) => `<ul><li data-task-id="a"><span data-row-meta>${'<span>x</span>'.repeat(n)}</span></li></ul>`
  await fixture(row(5))
  assert.deepEqual(await page.evaluate(rowMetaItems, 5), [])
  await fixture(row(6))
  assert.deepEqual(rules(await page.evaluate(rowMetaItems, 5)), ['M3'])
})

test('M4 primary destinations: six pass, seven fail', { skip }, async () => {
  const nav = (n) => `<nav data-sidebar-primary>${'<a href="#">x</a>'.repeat(n)}</nav>`
  await fixture(nav(6))
  assert.deepEqual(await page.evaluate(primaryDestinations, 6), [])
  await fixture(nav(7))
  assert.equal((await page.evaluate(primaryDestinations, 6))[0].value, 7)
})

test('M6 overflow: a designated scroller passes, a wide row fails with its element', { skip }, async () => {
  await fixture('<div data-scroll-x style="overflow-x:auto"><div style="width:900px">wide table</div></div>')
  assert.deepEqual(await page.evaluate(horizontalOverflow), [])
  await fixture('<div><span style="display:inline-block;width:500px" aria-label="Einstellungen">long German label</span></div>')
  const r = await page.evaluate(horizontalOverflow)
  assert.ok(r.some((v) => v.rule === 'M6' && v.element.includes('Einstellungen')), JSON.stringify(r))
})

test('M7 target size: 44 px on touch; 24 px or clear spacing with a fine pointer', { skip }, async () => {
  await fixture('<button style="width:44px;height:44px">a</button>')
  assert.deepEqual(await page.evaluate(targetSize, [44, false]), [])
  await fixture('<button style="width:30px;height:30px">a</button>')
  assert.deepEqual(rules(await page.evaluate(targetSize, [44, false])), ['M7'])
  // 20 × 20 with a neighbour 8 px away fails; alone (24 px circle clear) passes.
  await fixture('<button style="width:20px;height:20px;padding:0">a</button><button style="width:20px;height:20px;padding:0;margin-left:8px">b</button>')
  assert.equal((await page.evaluate(targetSize, [24, true])).length, 2)
  await fixture('<button style="width:20px;height:20px;padding:0">a</button><button style="width:20px;height:20px;padding:0;margin-left:40px">b</button>')
  assert.deepEqual(await page.evaluate(targetSize, [24, true]), [])
  // An inline link in running text is exempt.
  await fixture('<p>Read <a href="#">the guide</a> first.</p>')
  assert.deepEqual(await page.evaluate(targetSize, [24, true]), [])
})

test('M8 focus: the token ring passes, outline:none with nothing else fails', { skip }, async () => {
  await fixture('<style>button:focus-visible{outline:2px solid #2563eb}</style><button>ok</button>')
  assert.deepEqual(await focusWalk(page), [])
  await fixture('<style>button{outline:none!important}</style><button>bare</button>')
  const r = await focusWalk(page)
  assert.deepEqual(rules(r), ['M8'])
  assert.ok(r[0].element.includes('bare'))
})

test('M10 truncation: the full text in aria-label or a tooltip passes, a bare cut name fails', { skip }, async () => {
  const cut = (attrs) => `<a href="#" ${attrs} style="display:block;width:80px"><span style="display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">Home renovation with a long name</span></a>`
  await fixture(cut('aria-label="Home renovation with a long name"'))
  assert.deepEqual(await page.evaluate(truncation), [])
  await fixture(cut('data-tip="Home renovation with a long name"'))
  assert.deepEqual(await page.evaluate(truncation), [])
  // A link named by its content is announced with the whole name.
  await fixture(cut(''))
  assert.deepEqual(await page.evaluate(truncation), [])
  // A cut heading outside any control, with no name or tooltip, fails.
  await fixture('<h2 style="width:80px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">Home renovation with a long name</h2>')
  assert.deepEqual(rules(await page.evaluate(truncation)), ['M10'])
})

test('M11 overlap: side by side passes, stacked controls fail', { skip }, async () => {
  await fixture('<button style="width:40px;height:40px">a</button><button style="width:40px;height:40px">b</button>')
  assert.deepEqual(await page.evaluate(overlaps), [])
  await fixture('<button style="width:40px;height:40px">a</button><button style="position:absolute;left:10px;top:10px;width:40px;height:40px">b</button>')
  assert.deepEqual(rules(await page.evaluate(overlaps)), ['M11'])
  // An open menu covers the page's controls by design: only controls of one layer are compared.
  await fixture('<button style="width:40px;height:40px">a</button><div role="menu" style="position:absolute;left:10px;top:10px"><button style="width:40px;height:40px">b</button></div>')
  assert.deepEqual(await page.evaluate(overlaps), [])
})

test('M12 layout shift: a still page passes, a late banner fails', { skip }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } })
  await ctx.addInitScript(LAYOUT_SHIFT_INIT)
  const p = await ctx.newPage()
  const go = (html) => p.goto('data:text/html,' + encodeURIComponent(`<!doctype html><body>${html}</body>`))
  await go('<p>steady</p><p>text</p>')
  await p.evaluate(() => new Promise((r) => setTimeout(r, 100)))
  assert.deepEqual(await p.evaluate(layoutShift, 0.1), [])
  await go('<div id="top"></div><p style="font-size:40px">one</p><p style="font-size:40px">two</p><p style="font-size:40px">three</p>')
  await p.evaluate(() => new Promise((r) => setTimeout(() => { document.getElementById('top').style.height = '300px'; setTimeout(r, 200) }, 100)))
  assert.deepEqual(rules(await p.evaluate(layoutShift, 0.1)), ['M12'])
  await ctx.close()
})

test('M15 reduced motion: a fade passes, a transform transition fails', { skip }, async () => {
  await fixture('<style>@keyframes f{from{opacity:0}to{opacity:1}} .a{animation:f 5s}</style><div class="a">fade</div>', { reducedMotion: true })
  assert.deepEqual(await page.evaluate(movingAnimations), [])
  await fixture('<style>.m{transition:transform 5s}</style><div class="m" id="m">slide</div>', { reducedMotion: true })
  await page.evaluate(() => { const m = document.getElementById('m'); m.getBoundingClientRect(); m.style.transform = 'translateX(100px)' })
  const r = await page.evaluate(movingAnimations)
  assert.deepEqual(rules(r), ['M15'])
  assert.match(r[0].value, /transform/)
})
