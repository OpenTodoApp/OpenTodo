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
    // A settings section settling (motion-polish D3) hides its cards for at most 600 ms: check the page it settles into.
    for (let t = 0; t < 1000 && document.querySelector('[data-settings-settling]'); t += 50) await new Promise((r) => setTimeout(r, 50))
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
      // What reaches past the box's right edge first: that is what makes it scroll; a
      // child that only overflows itself (a clipped sr-only label) is named after it.
      .sort((a, b) => Number(b.getBoundingClientRect().right > right + 1) - Number(a.getBoundingClientRect().right > right + 1))
      .slice(0, 3)
    return wide.length ? `; widest: ${wide.map((c) => `${describe(c)} (${Math.round(c.getBoundingClientRect().width)}px, scroll ${c.scrollWidth}px)`).join(', ')}` : ''
  }
  function describe(el) {
    const label = el.getAttribute('aria-label') || el.getAttribute('role') || ''
    return `<${el.tagName.toLowerCase()}${label ? ` "${label}"` : ''}${el.className && typeof el.className === 'string' ? ` .${el.className.split(' ').slice(0, 3).join('.')}` : ''}>`
  }
}

// Tab rows (OpenSpec tab-row-scrollbar, design-system "Tab rows scroll only
// sideways"): a tab row never scrolls vertically, not even by the 1 px that
// verticalScrollers() tolerates for rounding elsewhere (GitHub issue 445).
export function tabRowOverflow() {
  const out = []
  for (const el of document.querySelectorAll('[role="tablist"]')) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.clientHeight === 0) continue
    const label = el.getAttribute('aria-label') || 'tablist'
    if (el.hasAttribute('data-tabs-row') && cs.overflowY !== 'hidden') out.push(`tab row "${label}" can scroll vertically (overflow-y: ${cs.overflowY})`)
    if (el.scrollHeight > el.clientHeight) out.push(`tab row "${label}" overflows vertically (${el.scrollHeight}px in ${el.clientHeight}px)`)
  }
  return out
}

// Crumbs that paint over each other (GitHub issue 1050): a crumb of a breadcrumb squeezed
// below its content must clip it, or its text and chevron run into the next crumb.
export function crumbOverlap() {
  const out = []
  for (const nav of document.querySelectorAll('[data-breadcrumb]')) {
    if (!nav.getClientRects().length) continue
    for (const crumb of nav.children) {
      if (getComputedStyle(crumb).overflowX === 'visible' && crumb.scrollWidth > crumb.clientWidth + 1) {
        out.push(`breadcrumb: "${crumb.textContent.trim().slice(0, 40)}" overflows its crumb (${crumb.scrollWidth} px in ${crumb.clientWidth} px) and paints over its neighbour`)
      }
    }
  }
  return out
}

// Cut labels (polish 2026-11-02): an option of a segmented control and the day's name
// in a Day or Week header are never cut. The scope toggle split its row evenly and cut
// "This occurrence" with room to spare; the Week header beside the planning list cut
// "Tue 3" to "T…". Their full text is in the accessible name, so the truncation rule
// of the audit (M10) does not see them.
export function cutLabels() {
  const out = []
  const cut = (el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1
  for (const el of document.querySelectorAll('[role="radiogroup"] > [role="radio"]')) {
    if (cut(el)) out.push(`option "${el.textContent.trim()}" of "${el.parentElement.getAttribute('aria-label') ?? ''}" is cut (${el.scrollWidth}px in ${el.clientWidth}px)`)
  }
  for (const el of document.querySelectorAll('[data-day-header] [data-day-name]')) {
    if (cut(el)) out.push(`day name "${el.textContent.trim()}" in the calendar header is cut (${el.scrollWidth}px in ${el.clientWidth}px)`)
  }
  return out
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

// The task checkbox on a touch screen (phone-touch-focus D1): a tap 8 px outside the
// 20 px circle, left, right, above or below, lands on the circle's own button, never on
// the row's open control beside it. Only on a coarse pointer, at most three reports.
export function rowCheckReach() {
  if (!matchMedia('(pointer: coarse)').matches) return []
  const out = []
  for (const row of document.querySelectorAll('[data-task-id]')) {
    const mark = row.querySelector('[data-check-mark]')
    const button = mark?.closest('button')
    if (!button || button.disabled || getComputedStyle(button).visibility === 'hidden') continue
    const m = mark.getBoundingClientRect()
    if (!m.width || m.top < 30 || m.bottom > innerHeight - 30) continue
    const cx = m.left + m.width / 2, cy = m.top + m.height / 2, d = m.width / 2 + 8
    for (const [side, x, y] of [['left', cx - d, cy], ['right', cx + d, cy], ['above', cx, cy - d], ['below', cx, cy + d]]) {
      const hit = document.elementFromPoint(x, y)
      if (hit && !button.contains(hit) && row.contains(hit)) {
        out.push(`row "${(row.querySelector('[data-row-title]')?.textContent ?? '').trim().slice(0, 30)}": a tap 8 px ${side} of the checkbox lands on ${hit.closest('[data-row-open]') ? 'the open control' : hit.tagName.toLowerCase()}`)
        break
      }
    }
    if (out.length >= 3) break
  }
  return out
}

// Text fields under 16 px (issue #724): Safari on iOS zooms the page in when such a
// field gets focus, and an installed app stays zoomed. Every input that takes text, every
// textarea and select, and every editable area with the text inside it, measured under
// the touch emulation the layout check runs with (pointer: coarse).
// Quick add's token tints (GitHub issue 1051): the copy of the text behind the field must
// set its text exactly as the field does, or the tints drift off the words they mark. The
// field takes the phone's 16 px size; the copy took the 13 px body size and sat above.
export function tintDrift(rootSel) {
  const root = rootSel ? document.querySelector(rootSel) : document.body
  const out = []
  for (const tint of root?.querySelectorAll('[data-quick-add-tints]') ?? []) {
    const field = tint.parentElement?.querySelector('textarea')
    if (!field || !tint.getClientRects().length) continue
    const a = getComputedStyle(tint), b = getComputedStyle(field)
    for (const k of ['fontSize', 'lineHeight', 'fontFamily', 'paddingTop', 'paddingLeft', 'borderTopWidth', 'letterSpacing']) {
      if (a[k] !== b[k]) out.push(`quick add tints: ${k} ${a[k]} behind a field of ${b[k]}`)
    }
  }
  return out
}

export function smallFields([rootSel, min]) {
  const root = rootSel ? document.querySelector(rootSel) : document.body
  if (!root) return []
  const NOT_TEXT = new Set(['checkbox', 'radio', 'range', 'color', 'hidden', 'file', 'button', 'submit', 'reset', 'image'])
  const out = []
  const seen = new Set()
  const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || el.id || el.className?.toString?.().split(' ')[0] || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40)
  const report = (el, field) => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return
    const size = parseFloat(cs.fontSize)
    if (!(size + 0.01 < min)) return
    const key = `${field.tagName}:${name(field)}:${size}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(`"${name(field)}" (${field.tagName.toLowerCase()}${el === field ? '' : ' > ' + el.tagName.toLowerCase()}) has ${Math.round(size * 100) / 100}px text: iOS zooms in on focus below ${min}px`)
  }
  for (const el of root.querySelectorAll('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) {
    if (el.tagName === 'INPUT' && NOT_TEXT.has((el.getAttribute('type') || 'text').toLowerCase())) continue
    if (el.closest('[inert]')) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    report(el, el)
    if (el.isContentEditable && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') {
      for (const d of el.querySelectorAll('*')) {
        if ([...d.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) report(d, el)
      }
    }
  }
  return out
}

// Touch feels like an app (shell-touch, GitHub issue 1338), on the touch screen: the page
// ends the overscroll chain (no bounce, no pull to reload) and keeps zoom; no control or
// navigation can be text-selected by a long press; every field, editable area and comment
// stays selectable. With a root selector only that subtree's controls and fields are read.
export function touchFeel([rootSel]) {
  const root = rootSel ? document.querySelector(rootSel) : document.body
  if (!root) return []
  const out = []
  if (!rootSel) {
    const html = getComputedStyle(document.documentElement)
    if (html.overscrollBehaviorY !== 'none') out.push(`the page's overscroll-behavior is ${html.overscrollBehaviorY}: it bounces or reloads on a pull`)
    const viewport = document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? ''
    if (/user-scalable\s*=\s*(no|0)|maximum-scale/i.test(viewport)) out.push(`the viewport turns zoom off: ${viewport}`)
    for (const el of [document.documentElement, document.body]) {
      const action = getComputedStyle(el).touchAction
      if (action !== 'auto' && action !== 'manipulation') out.push(`${el.tagName.toLowerCase()} has touch-action ${action}: pinch zoom is blocked`)
    }
  }
  const NOT_TEXT = new Set(['checkbox', 'radio', 'range', 'color', 'hidden', 'file', 'button', 'submit', 'reset', 'image'])
  const seen = new Set()
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40)
  const shown = (el) => {
    if (el.closest('[inert]')) return false
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return cs.display !== 'none' && cs.visibility !== 'hidden' && (r.width > 0 || r.height > 0)
  }
  const select = (el) => { const cs = getComputedStyle(el); return cs.userSelect || cs.webkitUserSelect }
  const report = (el, text) => {
    const key = `${el.tagName}:${name(el)}:${text}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(`"${name(el)}" (${el.tagName.toLowerCase()}) ${text}`)
  }
  const CHROME = 'button, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="switch"], summary, nav, a.ui-btn, [data-phone-bar], [data-sidebar], [data-page-header]'
  for (const el of root.querySelectorAll(CHROME)) {
    if (shown(el) && select(el) !== 'none') report(el, `can be text-selected by a long press (user-select: ${select(el)})`)
  }
  for (const el of root.querySelectorAll('input, textarea, [contenteditable]:not([contenteditable="false"]), article p, [data-row-details]')) {
    if (el.tagName === 'INPUT' && NOT_TEXT.has((el.getAttribute('type') || 'text').toLowerCase())) continue
    if (shown(el) && select(el) === 'none') report(el, 'is content but cannot be selected (user-select: none)')
  }
  return out
}

// Crowded controls (themes-layout-template): on a settings page, two visible controls
// that overlap, or a control within `gap` px of a row divider (a line drawn as a top or
// bottom border of an element without side borders, as `divide-y` and row separators
// draw it); a control drawn wholly inside another (a menu in a card's corner) is allowed.
// The owner found the actions under "New theme" touching the next row; this
// catches that on every row of the page, not only the one reported. At most five reports.
export function crowdedControls([rootSel, gap]) {
  const root = rootSel ? document.querySelector(rootSel) : document.body
  if (!root) return []
  const visible = (el) => {
    // The page's own header (title bar and its buttons) is chrome, not a row of the page.
    if (el.closest('[aria-hidden="true"], [inert], .sr-only, [data-overlay-root], header, [data-page-header]')) return false
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') return false
    const r = el.getBoundingClientRect()
    return r.width > 2 && r.height > 2
  }
  const sel = 'a[href], button, [role="button"], [role="radio"], input:not([type="hidden"]), select, textarea, summary'
  const controls = [...root.querySelectorAll(sel)].filter(visible)
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40)
  const out = []
  // Overlap: two controls neither of which holds the other, crossing by more than 1 px both ways.
  const rects = controls.map((el) => [el, el.getBoundingClientRect()])
  for (let i = 0; i < rects.length && out.length < 5; i++) {
    const [a, ra] = rects[i]
    for (let j = i + 1; j < rects.length; j++) {
      const [b, rb] = rects[j]
      if (a.contains(b) || b.contains(a)) continue
      // A control drawn wholly inside another (a card's menu button in its corner) is a deliberate layer, not a collision.
      const inside = (p, q) => q.left >= p.left - 0.5 && q.right <= p.right + 0.5 && q.top >= p.top - 0.5 && q.bottom <= p.bottom + 0.5
      if (inside(ra, rb) || inside(rb, ra)) continue
      const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)
      const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
      if (x > 1 && y > 1) { out.push(`"${name(a)}" and "${name(b)}" overlap (${Math.round(x)}×${Math.round(y)} px)`); break }
    }
  }
  // Dividers: horizontal lines between rows.
  const lines = []
  for (const el of root.querySelectorAll('*')) {
    const cs = getComputedStyle(el)
    if (parseFloat(cs.borderLeftWidth) > 0 || parseFloat(cs.borderRightWidth) > 0) continue
    const r = el.getBoundingClientRect()
    if (r.width < 120 || cs.display === 'none') continue
    if (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none') lines.push([el, r.top, r])
    if (parseFloat(cs.borderBottomWidth) > 0 && cs.borderBottomStyle !== 'none') lines.push([el, r.bottom, r])
  }
  for (const [el, r] of rects) {
    if (out.length >= 5) break
    for (const [line, y, lr] of lines) {
      if (line === el || line.contains(el) && (y === lr.top ? r.top - y >= gap : y - r.bottom >= gap)) continue
      if (el.contains(line)) continue
      if (r.right <= lr.left || r.left >= lr.right) continue
      const away = r.bottom <= y ? y - r.bottom : r.top >= y ? r.top - y : -1
      if (away < gap) { out.push(`"${name(el)}" is ${away < 0 ? 'across' : `${Math.round(away)} px from`} a row divider (at least ${gap} px)`); break }
    }
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

// What an overlay holds fits in it (issue #731, the start guide in a narrow card):
// nothing sticks out of the panel sideways, and no sentence is squeezed into a column a
// word or two wide by the controls beside it (eight words or more need 8rem).
export function overlayContentFit(rootSel) {
  const root = document.querySelector(rootSel)
  if (!root) return []
  const box = root.getBoundingClientRect()
  const out = []
  const reported = []
  const name = (el) => `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`
  for (const el of root.querySelectorAll('*')) {
    if (el.closest('[data-scroll-x], [aria-hidden="true"]') || reported.some((r) => r.contains(el))) continue
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue
    if (r.left < box.left - 1 || r.right > box.right + 1) {
      reported.push(el)
      out.push(`${name(el)} sticks out of the overlay (${Math.round(r.left)} to ${Math.round(r.right)} px, panel ${Math.round(box.left)} to ${Math.round(box.right)} px)`)
      continue
    }
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ')
    const words = own.split(/\s+/).filter(Boolean).length
    if (words >= 8 && r.width < 128) { reported.push(el); out.push(`${name(el)} is squeezed into ${Math.round(r.width)} px`) }
    if (out.length >= 5) break
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
// last row sits above the button's footprint. Nor does it cover a form field where the
// page rests, at its top or its end (a Settings sub-page or Import, where quick add has
// no purpose and the button is left out). Scrolls the content column to its end.
export async function addButtonCovers() {
  const button = document.querySelector('[data-add-button]:not([data-away])')
  const content = document.querySelector('#content')
  if (!button || !content || !button.getClientRects().length) return []
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const hits = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  const out = []
  const fieldsUnder = (where) => {
    const b = button.getBoundingClientRect()
    for (const f of content.querySelectorAll('input:not([type=hidden]), select, textarea, [role=combobox], [contenteditable=true]')) {
      if (!f.getClientRects().length || f.closest('[data-add-button]')) continue
      if (hits(f.getBoundingClientRect(), b)) out.push(`the add button covers the field "${(f.getAttribute('aria-label') || f.labels?.[0]?.textContent || f.getAttribute('name') || f.tagName).trim().slice(0, 40)}" at the ${where} of the page`)
    }
  }
  content.scrollTop = 0
  await frame()
  fieldsUnder('top')
  content.scrollTop = content.scrollHeight
  await frame()
  fieldsUnder('end')
  const rows = [...document.querySelectorAll('[data-task-id]')].filter((r) => r.getClientRects().length)
  const last = rows[rows.length - 1]
  if (last && hits(last.getBoundingClientRect(), button.getBoundingClientRect())) out.push(`the add button covers the last row "${last.textContent.trim().slice(0, 30)}" at the end of the list`)
  content.scrollTop = 0
  return [...new Set(out)]
}

// The Day and Week grid (GitHub issue 775): the sticky header (day names, all-day
// strips, unscheduled lanes) leaves at least half of the calendar to the hour grid,
// and the now line, scrolled under the header, is painted below it, never over a lane.
export function calendarGridRoom() {
  const sc = document.querySelector('[data-calendar-scroller]')
  const head = sc?.querySelector('.sticky')
  if (!sc || !head || !sc.clientHeight) return []
  const out = []
  const h = head.getBoundingClientRect().height
  if (h > sc.clientHeight / 2) out.push(`the calendar header takes ${Math.round(h)} px of ${sc.clientHeight} px`)
  const line = sc.querySelector('[data-now-line]')
  if (line) {
    const before = sc.scrollTop
    const hr = head.getBoundingClientRect()
    sc.scrollTop += line.getBoundingClientRect().top - (hr.top + hr.height / 2)
    const lr = line.getBoundingClientRect()
    if (lr.top > hr.top && lr.top < hr.bottom) {
      // The line ignores the pointer; hit-test it for a moment to see what is painted on top.
      line.style.pointerEvents = 'auto'
      const at = document.elementFromPoint(lr.left + lr.width / 2, lr.top + 1)
      line.style.pointerEvents = ''
      if (at?.closest('[data-now-line]')) out.push('the now line paints over the calendar header')
    }
    sc.scrollTop = before
  }
  return out
}

// Safe areas (GitHub issue 973): with `viewport-fit=cover` the page runs under the
// status bar, the notch or Dynamic Island, the home indicator and, in landscape, the
// rounded sides. No control that can be tapped may sit in those strips: a control is
// reported when the topmost element at a point of it inside a strip is the control
// itself (not a bar's padding drawn over it). Content that can still scroll away from
// a strip is left alone: rows under the home indicator before the end of a list, a
// strip of cards scrolled sideways. `insets` is { top, right, bottom, left } in px.
export function insetOverlaps([rootSel, insets]) {
  const root = rootSel ? document.querySelector(rootSel) : document.body
  if (!root) return []
  const vw = window.innerWidth, vh = window.innerHeight
  const sel = 'a[href], button, [role="button"], input:not([type="hidden"]), select, textarea, summary, [role="option"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="switch"], [contenteditable="true"]'
  const scrollable = (a, axis) => {
    const cs = getComputedStyle(a)
    const ov = axis === 'y' ? cs.overflowY : cs.overflowX
    if (a === document.scrollingElement) return axis === 'y' ? a.scrollHeight > a.clientHeight + 1 : a.scrollWidth > a.clientWidth + 1
    return /(auto|scroll)/.test(ov) && (axis === 'y' ? a.scrollHeight > a.clientHeight + 1 : a.scrollWidth > a.clientWidth + 1)
  }
  // Whether scrolling can still move `el` out of the strip on `side`.
  const canLeave = (el, side) => {
    const axis = side === 'top' || side === 'bottom' ? 'y' : 'x'
    for (let a = el.parentElement; a; a = a.parentElement) {
      if (!scrollable(a, axis)) { if (getComputedStyle(a).position === 'fixed') return false; continue }
      if (side === 'top') return a.scrollTop > 1
      if (side === 'left') return a.scrollLeft > 1
      if (side === 'bottom') return a.scrollTop + a.clientHeight < a.scrollHeight - 1
      return a.scrollLeft + a.clientWidth < a.scrollWidth - 1
    }
    const d = document.scrollingElement
    if (axis === 'y' && scrollable(d, 'y')) return side === 'top' ? d.scrollTop > 1 : d.scrollTop + d.clientHeight < d.scrollHeight - 1
    return false
  }
  const strips = {
    top: { x0: 0, x1: vw, y0: 0, y1: insets.top ?? 0 },
    bottom: { x0: 0, x1: vw, y0: vh - (insets.bottom ?? 0), y1: vh },
    left: { x0: 0, x1: insets.left ?? 0, y0: 0, y1: vh },
    right: { x0: vw - (insets.right ?? 0), x1: vw, y0: 0, y1: vh },
  }
  const out = []
  const seen = new Set()
  // The status bar's backdrop (issue 999) is drawn over the page's top strip on purpose;
  // hit tests look through it, so a control hidden under it still counts as in the strip.
  const backdrops = [...document.querySelectorAll('[data-status-bar-backdrop]')]
  for (const b of backdrops) b.style.pointerEvents = 'none'
  for (const el of root.querySelectorAll(sel)) {
    if (el.closest('[aria-hidden="true"], [inert], .sr-only')) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') continue
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) continue
    for (const [side, s] of Object.entries(strips)) {
      if (s.x1 - s.x0 <= 0 || s.y1 - s.y0 <= 0) continue
      // The part of the control inside the strip (a pixel of tolerance).
      const x0 = Math.max(r.left, s.x0), x1 = Math.min(r.right, s.x1), y0 = Math.max(r.top, s.y0), y1 = Math.min(r.bottom, s.y1)
      if (x1 - x0 < 2 || y1 - y0 < 2) continue
      const hit = document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2)
      if (!hit || !(el === hit || el.contains(hit))) continue
      if (canLeave(el, side)) continue
      const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.getAttribute('name') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40)
      const key = `${side}:${el.tagName}:${name}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(`"${name}" (${el.tagName.toLowerCase()}) is in the ${side} safe area (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}px; the strip is ${side === 'top' || side === 'bottom' ? Math.round(s.y1 - s.y0) : Math.round(s.x1 - s.x0)} px)`)
    }
  }
  for (const b of backdrops) b.style.pointerEvents = ''
  return out
}

// The top edge at rest (GitHub issue 999): the installed app on an iPhone runs under
// the status bar, and Safari covers that strip with a soft blur, taller than the strip,
// unless an opaque fixed element spans the top edge, whose colour it extends instead.
// So, with a top inset, one opaque `position: fixed` element must cover the whole
// strip, and no text may be drawn inside it unless scrolling can still move the text
// out (a list scrolled down). `insets` is { top, right, bottom, left } in px.
export function topEdge([insets]) {
  const top = insets.top ?? 0
  if (top <= 0) return []
  const vw = window.innerWidth
  const out = []
  const opaque = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/)
    if (!m) return c !== 'transparent' && c !== ''
    const parts = m[1].split(/[\s,/]+/).filter(Boolean)
    return parts.length < 4 || Number.parseFloat(parts[3]) >= 1
  }
  const backdrop = [...document.querySelectorAll('body *')].some((el) => {
    const cs = getComputedStyle(el)
    if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden' || Number.parseFloat(cs.opacity) < 1) return false
    if (!opaque(cs.backgroundColor)) return false
    const r = el.getBoundingClientRect()
    return r.top <= 0.5 && r.bottom >= top - 0.5 && r.left <= 0.5 && r.right >= vw - 0.5
  })
  if (!backdrop) out.push(`no opaque fixed element covers the top safe area (${top} px), so Safari blurs the page under the status bar`)
  // Whether the nearest scroller of `el` is scrolled down, so the text can scroll back out.
  const scrolledAway = (el) => {
    for (let a = el.parentElement; a; a = a.parentElement) {
      const cs = getComputedStyle(a)
      if (/(auto|scroll)/.test(cs.overflowY) && a.scrollHeight > a.clientHeight + 1) return a.scrollTop > 1
      if (cs.position === 'fixed') return false
    }
    const d = document.scrollingElement
    return !!d && d.scrollTop > 1
  }
  const seen = new Set()
  const backdrops = [...document.querySelectorAll('[data-status-bar-backdrop]')]
  for (const b of backdrops) b.style.pointerEvents = 'none'
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.trim()
    const el = n.parentElement
    if (!text || !el || el.closest('[aria-hidden="true"], [inert], .sr-only, script, style')) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number.parseFloat(cs.opacity) === 0) continue
    const range = document.createRange()
    range.selectNodeContents(n)
    const r = [...range.getClientRects()].find((b) => b.width >= 1 && b.height >= 1 && b.top < top - 1 && b.bottom > 1 && b.right > 0 && b.left < vw)
    if (!r || scrolledAway(el)) continue
    // Only text that is drawn there: a sheet or a panel over the page hides what is below it
    // (the backdrop does not count: text under it is still in the strip).
    const hit = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 0), vw - 1), Math.max((Math.max(r.top, 0) + Math.min(r.bottom, top)) / 2, 0))
    if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) continue
    const name = text.replace(/\s+/g, ' ').slice(0, 40)
    if (seen.has(name)) continue
    seen.add(name)
    out.push(`"${name}" is drawn in the top safe area at rest (its top at ${Math.round(r.top)} px; the strip is ${top} px)`)
  }
  for (const b of backdrops) b.style.pointerEvents = ''
  return out
}
