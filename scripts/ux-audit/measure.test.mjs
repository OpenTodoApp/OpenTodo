// Browser tests of the audit's measurements over small HTML fixtures (OpenSpec
// change ux-audit-three-widths, tasks 2.2 to 2.4): one passing and one failing case
// per rule. Needs Playwright's Chromium (global install, CHROMIUM_PATH); skipped
// without it. Run: node --test scripts/ux-audit/measure.test.mjs
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chromeRows, credentialFields, focusWalk, horizontalOverflow, installHelpers, layoutShift, LAYOUT_SHIFT_INIT, motionSeen, movingAnimations,
  overlaps, primaryDestinations, reflow, rowMetaItems, targetSize, targetSizeWcag, TEXT_SPACING_CSS, textSpacingClip, truncation, watchMotion,
} from './audit-measures.mjs'
import { smallFields } from './measure.mjs'

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

test('M15 over a moment: a short slide that ends before the snapshot is caught, a fade is not', { skip }, async () => {
  await fixture('<style>.f{transition:opacity 80ms}.m{transition:transform 80ms}</style><div class="f" id="f">fade</div><div class="m" id="m">slide</div>', { reducedMotion: true })
  await page.evaluate(watchMotion)
  await page.evaluate(() => { document.getElementById('f').style.opacity = '0.5' })
  await page.waitForTimeout(200)
  assert.deepEqual(await page.evaluate(motionSeen), [])
  await page.evaluate(watchMotion)
  await page.evaluate(() => { document.getElementById('m').style.transform = 'translateX(40px)' })
  await page.waitForTimeout(200)
  const r = await page.evaluate(motionSeen)
  assert.deepEqual(rules(r), ['M15'])
  assert.match(r[0].value, /transform/)
})

test('text fields under 16 px (issue #724): 16 px fields pass, smaller fields and editable text fail', { skip }, async () => {
  await fixture('<input aria-label="Big" style="font-size:16px"><textarea aria-label="Note" style="font-size:16px"></textarea><input type="checkbox" style="font-size:10px"><div contenteditable="true"><p>notes</p></div>')
  assert.deepEqual(await page.evaluate(smallFields, [null, 16]), [])
  await fixture('<input aria-label="Quick add" style="font-size:13px"><select aria-label="Pick" style="font-size:14px"><option>a</option></select><div contenteditable="true" aria-label="Notes"><p style="font-size:15px">notes</p></div><input aria-label="Gone" style="display:none;font-size:10px">')
  const r = await page.evaluate(smallFields, [null, 16])
  assert.equal(r.length, 3)
  assert.match(r[0], /"Quick add" \(input\) has 13px/)
  assert.match(r[2], /"Notes" \(div > p\) has 15px/)
})

test('crowded controls (themes-layout-template): padded rows pass; touching a divider or overlapping fails', { skip }, async () => {
  const { crowdedControls } = await import('./measure.mjs')
  const row = (pad, inner) => `<div style="padding:${pad}px 0;border-top:1px solid #ccc">${inner}</div>`
  await fixture(`<main style="width:300px">${row(12, '<button style="height:32px">New theme</button>')}${row(12, '<button style="height:32px">Accent</button>')}</main>`)
  assert.deepEqual(await page.evaluate(crowdedControls, ['main', 4]), [])
  // The owner's case: the buttons end on the next row's divider.
  await fixture(`<main style="width:300px">${row(0, '<button style="height:32px">New theme</button>')}${row(12, '<button style="height:32px">Accent</button>')}</main>`)
  const touching = await page.evaluate(crowdedControls, ['main', 4])
  assert.equal(touching.length, 1)
  assert.match(touching[0], /"New theme" is [01] px from a row divider/)
  await fixture('<main style="width:300px"><button style="width:120px;height:32px">One</button><button style="width:120px;height:32px;margin-left:-40px">Two</button></main>')
  assert.match((await page.evaluate(crowdedControls, ['main', 4]))[0], /"One" and "Two" overlap/)
})

test('overlay content fit (issue #731): a wrapped notice passes, a squeezed or sticking-out one fails', { skip }, async () => {
  const { overlayContentFit } = await import('./measure.mjs')
  const sentence = 'Open on the Loop home on this device? It shows what needs your attention today.'
  await fixture(`<div id="o" style="width:320px"><div style="display:flex;flex-wrap:wrap"><p style="flex:1 0 16rem;margin:0">${sentence}</p><span><button>Open on the Loop home</button></span></div></div>`)
  assert.deepEqual(await page.evaluate(overlayContentFit, '#o'), [])
  await fixture(`<div id="o" style="width:320px"><div style="display:flex"><p style="flex:1;min-width:0;margin:0">${sentence}</p><span style="flex-shrink:0;white-space:nowrap"><button>Open on the Loop home</button><button>Keep my start view</button></span></div></div>`)
  const r = await page.evaluate(overlayContentFit, '#o')
  assert.ok(r.some((m) => m.includes('squeezed')), r.join('; '))
  await fixture(`<div id="o" style="width:320px"><div style="display:flex"><p style="flex:1;margin:0">Hi</p><span style="flex-shrink:0;width:360px"><button>Open on the Loop home</button></span></div></div>`)
  const out = await page.evaluate(overlayContentFit, '#o')
  assert.equal(out.length, 1, out.join('; '))
  assert.match(out[0], /^span .* sticks out of the overlay/)
})

test('cut labels: whole options and day names pass, a cut option or day name fails', { skip }, async () => {
  const { cutLabels } = await import('./measure.mjs')
  const opt = (w, text) => `<button role="radio" style="width:${w}px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding:0;border:0">${text}</button>`
  const day = (w) => `<div data-day-header><span data-day-name style="display:block;width:${w}px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">Tue 3</span></div>`
  await fixture(`<div role="radiogroup" aria-label="Edit scope">${opt(200, 'This occurrence')}${opt(200, 'All occurrences')}</div>${day(120)}`)
  assert.deepEqual(await page.evaluate(cutLabels), [])
  await fixture(`<div role="radiogroup" aria-label="Edit scope">${opt(60, 'This occurrence')}${opt(200, 'All occurrences')}</div>${day(12)}`)
  const r = await page.evaluate(cutLabels)
  assert.equal(r.length, 2, r.join('; '))
  assert.match(r[0], /^option "This occurrence" of "Edit scope" is cut/)
  assert.match(r[1], /^day name "Tue 3" in the calendar header is cut/)
})

// The accessibility gate's measures (accessibility-aa D2): one passing and one failing page each.
test('M17 focus not obscured: a button under a sticky bar fails, one in view passes', { skip }, async () => {
  const ring = '<style>button:focus-visible{outline:2px solid #2563eb}</style>'
  await fixture(`${ring}<button>ok</button>`)
  assert.deepEqual(await focusWalk(page, 10, { obscured: true }), [])
  await fixture(`${ring}<button style="position:absolute;top:600px;left:10px">hidden</button><div style="position:fixed;left:0;right:0;top:560px;height:80px;background:#eee">toast</div>`)
  const r = await focusWalk(page, 10, { obscured: true })
  assert.deepEqual(rules(r), ['M17'])
  assert.match(r[0].value, /focus obscured by <div>/)
})

test('M17: a link wrapped over two lines shows when one of its lines does', { skip }, async () => {
  const ring = '<style>a:focus-visible{outline:2px solid #2563eb}</style>'
  // The bar covers the first line of the link; the second line is in view.
  await fixture(`${ring}<p style="width:200px;margin-top:40px">Some words before <a href="#">a link that wraps onto the next line</a> and after.</p><div style="position:fixed;left:0;right:0;top:0;height:62px;background:#eee"></div>`)
  assert.deepEqual(await focusWalk(page, 5, { obscured: true }), [])
})

test('M18 reflow: a wrapping page and a listed grid pass, a wide form row fails', { skip }, async () => {
  await page.setViewportSize({ width: 320, height: 256 })
  try {
    await fixture('<p>Some text that wraps at any width.</p><div data-calendar-scroller style="overflow:auto"><div style="width:900px">week grid</div></div>')
    assert.deepEqual(await page.evaluate(reflow, ['[data-calendar-scroller]']), [])
    await fixture('<div style="overflow-x:auto"><div style="width:900px">settings row</div></div><div style="width:600px">wide</div>')
    const r = await page.evaluate(reflow, ['[data-calendar-scroller]'])
    assert.deepEqual(rules(r), ['M18', 'M18'])
    assert.equal(r[0].element, 'document')
  } finally {
    await page.setViewportSize({ width: 360, height: 640 })
  }
})

test('M19 text spacing: a growing box passes, a fixed-height label with hidden overflow fails', { skip }, async () => {
  const label = (style) => `<style>${TEXT_SPACING_CSS}</style><div style="width:120px;${style}">A label that wraps onto two lines</div>`
  await fixture(label(''))
  assert.deepEqual(await page.evaluate(textSpacingClip), [])
  await fixture(label('height:40px;overflow:hidden'))
  assert.deepEqual(rules(await page.evaluate(textSpacingClip)), ['M19'])
})

test('M20 credential fields: autocomplete and paste pass; no autocomplete or a blocked paste fails', { skip }, async () => {
  await fixture('<input type="password" autocomplete="current-password"><input inputmode="numeric" autocomplete="one-time-code">')
  assert.deepEqual(await page.evaluate(credentialFields), [])
  await fixture('<input type="password"><input data-credential autocomplete="one-time-code" onpaste="return false">')
  const r = await page.evaluate(credentialFields)
  assert.deepEqual(r.map((v) => v.value), ['autocomplete=""', 'paste cancelled'])
})

test('M21 target size per WCAG 2.5.8: 24 px, or a clear 24 px circle', { skip }, async () => {
  let n = 0
  const b = (style) => `<button style="position:absolute;padding:0;border:0;${style}">${++n}</button>`
  // Two 20 px buttons 2 px apart: their circles overlap.
  await fixture(b('left:10px;top:10px;width:20px;height:20px') + b('left:32px;top:10px;width:20px;height:20px'))
  assert.deepEqual(rules(await page.evaluate(targetSizeWcag)), ['M21', 'M21'])
  // 20 px buttons whose centres are 24 px apart pass; so does a 24 px one beside anything.
  await fixture(b('left:10px;top:10px;width:20px;height:20px') + b('left:34px;top:10px;width:20px;height:20px'))
  assert.deepEqual(await page.evaluate(targetSizeWcag), [])
  await fixture(b('left:10px;top:10px;width:24px;height:24px') + b('left:34px;top:10px;width:24px;height:24px'))
  assert.deepEqual(await page.evaluate(targetSizeWcag), [])
  // A 16 px tall button 2 px under a full-size one: its circle reaches into it.
  await fixture(b('left:10px;top:10px;width:120px;height:30px') + b('left:10px;top:42px;width:120px;height:16px'))
  assert.deepEqual(rules(await page.evaluate(targetSizeWcag)), ['M21'])
})
