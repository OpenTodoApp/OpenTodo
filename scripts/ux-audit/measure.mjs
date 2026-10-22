// Page measurements shared by the layout check (scripts/e2e-layout.mjs) and the
// interface audit tour (scripts/ux-audit/tour.mjs), OpenSpec change
// ux-audit-three-widths D2: one function per rule, so both tours measure the same
// thing. Functions passed to page.evaluate must not close over anything in this module.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

// The interface budget, one number in one place (web/src/app/budget.test.tsx reads it too).
export const BUDGET = JSON.parse(readFileSync(new URL('../../web/src/app/budget.json', import.meta.url), 'utf8'))
export const MAX_SCROLLERS = BUDGET.MAX_SCROLLERS

// axe-core (web devDependency, user-documentation task 5.1), or a global install.
export const AXE = (() => {
  try { return readFileSync(createRequire(new URL('../../web/package.json', import.meta.url)).resolve('axe-core/axe.min.js'), 'utf8') } catch { /* global */ }
  try { return readFileSync(join(execSync('npm root -g').toString().trim(), 'axe-core/axe.min.js'), 'utf8') } catch { return null }
})()
export async function axeProblems(p, include) {
  if (!AXE) return ['axe-core is not installed (npm ci in web/)']
  if (!(await p.evaluate(() => typeof window.axe !== 'undefined'))) await p.addScriptTag({ content: AXE })
  return p.evaluate(async (sel) => {
    // Entrances end first (motion-v2): a panel caught mid-fade reads as low contrast. Endless ones (spinners) are skipped.
    await Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().endTime !== Infinity).map((a) => a.finished.catch(() => {})))
    // eslint-disable-next-line no-undef
    const r = await axe.run(sel ? { include: [sel] } : document, { resultTypes: ['violations'] })
    return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `axe ${v.impact} ${v.id}: ${v.help} (${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')})`)
  }, include ?? null)
}


// ------------------------------------------------------------------ checks (run in the page)
// Horizontal overflow: the document, and any scroll container outside a designated
// `[data-scroll-x]` region whose content is wider than its box.
export function pageOverflow() {
  const out = []
  const vw = window.innerWidth
  const de = document.documentElement
  if (de.scrollWidth > vw + 1) out.push(`page scrolls sideways (${de.scrollWidth}px > ${vw}px)`)
  // Inside the app frame only its own panes scroll: a taller document lets the
  // whole frame scroll away and leaves a blank page (issue #95).
  if (document.querySelector('[data-app-frame]') && de.scrollHeight > window.innerHeight + 1) {
    out.push(`page scrolls past the app frame (${de.scrollHeight}px > ${window.innerHeight}px)`)
  }
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('[data-scroll-x]')) continue
    const cs = getComputedStyle(el)
    if (!/(auto|scroll)/.test(cs.overflowX)) continue
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      out.push(`${describe(el)} scrolls sideways (${el.scrollWidth}px in ${el.clientWidth}px)${culprits(el)}`)
    }
  }
  return out
  // The descendants that stick out of a sideways-scrolling box (deepest first), so
  // a failure names the element to fix instead of only its scroll container.
  function culprits(box) {
    const right = box.getBoundingClientRect().right
    const wide = [...box.querySelectorAll('*')]
      .filter((c) => c.getBoundingClientRect().width > 0 && (c.getBoundingClientRect().right > right + 1 || c.scrollWidth > c.clientWidth + 1))
      .filter((c, _, all) => !all.some((o) => o !== c && c.contains(o)))
      .slice(0, 3)
    return wide.length ? `; widest: ${wide.map((c) => `${describe(c)} (${Math.round(c.getBoundingClientRect().width)}px, scroll ${c.scrollWidth}px)`).join(', ')}` : ''
  }
  function describe(el) {
    const label = el.getAttribute('aria-label') || el.getAttribute('role') || ''
    return `<${el.tagName.toLowerCase()}${label ? ` "${label}"` : ''}${el.className && typeof el.className === 'string' ? ` .${el.className.split(' ').slice(0, 3).join('.')}` : ''}>`
  }
}

// Vertical scroll regions (OpenSpec ux-overhaul, app-shell "Three columns, three
// scrollers"): at most the sidebar, the content column and the panel may scroll
// vertically; everything else scrolls inside them. Designated regions
// (`data-scroll-y`: board columns, the calendar grid) and anything off screen or
// inside an overlay are not counted.
export function verticalScrollers() {
  const vw = window.innerWidth
  const out = []
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('[data-scroll-y], [data-overlay-root], [data-overlay]')) continue
    const cs = getComputedStyle(el)
    if (!/(auto|scroll)/.test(cs.overflowY) || cs.visibility === 'hidden') continue
    if (el.scrollHeight <= el.clientHeight + 1 || el.clientHeight === 0) continue
    const r = el.getBoundingClientRect()
    if (r.right <= 0 || r.left >= vw) continue
    const label = el.getAttribute('aria-label') || el.getAttribute('role') || ''
    out.push(`<${el.tagName.toLowerCase()}${label ? ` "${label}"` : ''}${typeof el.className === 'string' ? ` .${el.className.split(' ').slice(0, 3).join('.')}` : ''}> (${el.scrollHeight}px in ${el.clientHeight}px)`)
  }
  return out
}

// Touch targets inside `root` (default: the whole page) that are visible in the viewport.
// Task rows whose checkbox circle and title's first line are not centred on the same
// line (more than 3 px apart): on touch screens the title grows to the 44 px target and
// the circle has to follow it.
export function rowMisalignment() {
  const out = []
  for (const row of document.querySelectorAll('[data-task-id]')) {
    const circle = row.querySelector('.group\\/check')
    const text = row.querySelector('[data-row-open] .user-text')
    if (!circle || !text) continue
    const c = circle.getBoundingClientRect(), t = text.getBoundingClientRect()
    if (!c.height || !t.height || c.bottom < 0 || c.top > innerHeight) continue
    const line = parseFloat(getComputedStyle(text).lineHeight) || t.height
    const off = Math.abs((c.top + c.height / 2) - (t.top + Math.min(line, t.height) / 2))
    if (off > 3) out.push(`row "${text.textContent.trim().slice(0, 30)}": circle ${Math.round(off)} px off the title's first line`)
    if (out.length >= 3) break
  }
  return out
}

export function smallTargets([rootSel, min]) {
  const root = rootSel ? document.querySelector(rootSel) : document.body
  if (!root) return []
  const vw = window.innerWidth, vh = window.innerHeight
  const out = []
  const sel = 'a[href], button, [role="button"], input:not([type="hidden"]), select, textarea, summary, [role="option"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="switch"]'
  const seen = new Set()
  for (const el of root.querySelectorAll(sel)) {
    if (el.closest('[data-touch-exempt], [aria-hidden="true"], [inert]')) continue
    if (el.closest('[role="option"]') && el.getAttribute('role') !== 'option') continue
    let box = el
    const type = el.getAttribute('type')
    if (el.tagName === 'INPUT' && (type === 'checkbox' || type === 'radio')) box = el.closest('label') ?? el
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none') continue
    // Inline text links inside running text are exempt (WCAG 2.5.8 inline exception).
    if (el.tagName === 'A' && cs.display === 'inline') continue
    const r = box.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) continue
    // Clipped away by a scrolling ancestor (offscreen in a scroll region).
    let clipped = false
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const acs = getComputedStyle(a)
      if (/(auto|scroll|hidden|clip)/.test(acs.overflowX + acs.overflowY)) {
        const ar = a.getBoundingClientRect()
        if (r.right <= ar.left || r.left >= ar.right || r.bottom <= ar.top || r.top >= ar.bottom) { clipped = true; break }
      }
    }
    if (clipped) continue
    let opacity = 1
    for (let a = el; a && a !== document.body; a = a.parentElement) opacity *= Number(getComputedStyle(a).opacity)
    const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.getAttribute('name') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40)
    const key = `${el.tagName}:${name}`
    if (seen.has(key)) continue
    if (opacity < 0.05) { seen.add(key); out.push(`"${name}" (${el.tagName.toLowerCase()}) is invisible until hovered`); continue }
    if (r.width + 0.5 < min || r.height + 0.5 < min) { seen.add(key); out.push(`"${name}" (${el.tagName.toLowerCase()}) is ${Math.round(r.width)}×${Math.round(r.height)}px`) }
  }
  return out
}

// An overlay's entrance (motion-v2: a dialog scales up over 250 ms) has finished: a click
// on a control inside it while it still moves makes Playwright retry with other scroll
// alignments, which scrolls the overlay; a person's click does not.
export async function settled(overlay) {
  await overlay.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished.catch(() => {}))))
}

// The phone's add button never covers a row (phone-v2 D2): at the end of the list the
// last row sits above the button's footprint. Scrolls the content column to its end.
export async function addButtonCovers() {
  const button = document.querySelector('[data-add-button]:not([data-away])')
  const content = document.querySelector('#content')
  if (!button || !content || !button.getClientRects().length) return []
  content.scrollTop = content.scrollHeight
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const rows = [...document.querySelectorAll('[data-task-id]')].filter((r) => r.getClientRects().length)
  const last = rows[rows.length - 1]
  const out = []
  if (last) {
    const a = last.getBoundingClientRect(), b = button.getBoundingClientRect()
    if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) out.push(`the add button covers the last row "${last.textContent.trim().slice(0, 30)}" at the end of the list`)
  }
  content.scrollTop = 0
  return out
}
