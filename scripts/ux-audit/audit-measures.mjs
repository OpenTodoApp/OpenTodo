// The interface audit's measurements (OpenSpec change ux-audit-three-widths D3,
// tasks 2.2 to 2.4). Each returns violation records `{rule, element, value, limit}`.
// Page functions read `window.__ux` (installHelpers) and close over nothing else;
// focusWalk and the reduced-motion pass drive the page from Node.

/** Helpers the page functions share, installed once per page. */
export const PAGE_HELPERS = `window.__ux = {
  d(el) {
    if (!el || !el.tagName) return String(el)
    const name = (el.getAttribute('aria-label') || el.getAttribute('data-testid') || (el.textContent || '').trim().replace(/\\s+/g, ' ')).slice(0, 40)
    const cls = typeof el.className === 'string' ? el.className.split(' ').filter(Boolean).slice(0, 2).join('.') : ''
    return '<' + el.tagName.toLowerCase() + (cls ? '.' + cls : '') + '>' + (name ? ' "' + name + '"' : '')
  },
  shown(el) {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return false
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none') return false
    if (el.closest('[aria-hidden="true"], [inert], [data-touch-exempt]')) return false
    let o = 1
    for (let a = el; a && a !== document.body; a = a.parentElement) o *= Number(getComputedStyle(a).opacity)
    if (o < 0.05) return false
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const acs = getComputedStyle(a)
      if (/(auto|scroll|hidden|clip)/.test(acs.overflowX + acs.overflowY)) {
        const ar = a.getBoundingClientRect()
        if (r.right <= ar.left || r.left >= ar.right || r.bottom <= ar.top || r.top >= ar.bottom) return false
      }
    }
    return true
  },
  targets: 'a[href], button, [role="button"], input:not([type="hidden"]), select, textarea, summary, [role="option"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="switch"]',
}`

export async function installHelpers(page) {
  await page.evaluate(PAGE_HELPERS)
}

// ---------------------------------------------------------------- run in the page
/** M2: rows of chrome above a list page's first task (as budget.test.tsx counts them). */
export function chromeRows(limit) {
  const page = document.querySelector('[data-list-page]')
  if (!page || !page.querySelector('[data-task-id]')) return []
  let n = 0
  for (const child of page.children) { if (child.querySelector('[data-task-id]')) break; n++ }
  return n > limit ? [{ rule: 'M2', element: '[data-list-page]', value: n, limit }] : []
}

/** M3: metadata items of a row (rows-v2 D10's line), per visible row. */
export function rowMetaItems(limit) {
  const out = []
  for (const meta of document.querySelectorAll('[data-task-id] [data-row-meta]')) {
    const n = meta.children.length
    if (n > limit && window.__ux.shown(meta)) out.push({ rule: 'M3', element: window.__ux.d(meta.closest('[data-task-id]')), value: n, limit })
  }
  return out.slice(0, 5)
}

/** M4: primary sidebar destinations. */
export function primaryDestinations(limit) {
  const nav = document.querySelector('[data-sidebar-primary]')
  if (!nav) return []
  const n = nav.querySelectorAll('a, button[data-destination]').length
  return n > limit ? [{ rule: 'M4', element: '[data-sidebar-primary]', value: n, limit }] : []
}

/** M6: the page, and every element whose right edge leaves the viewport outside `[data-scroll-x]`. */
export function horizontalOverflow() {
  const out = []
  const vw = innerWidth
  const de = document.scrollingElement || document.documentElement
  if (de.scrollWidth > vw + 1) out.push({ rule: 'M6', element: 'document', value: de.scrollWidth, limit: vw })
  const wide = []
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('[data-scroll-x], [aria-hidden="true"], svg')) continue
    const r = el.getBoundingClientRect()
    if (!r.width || r.right <= vw + 1 || r.left >= vw) continue
    if (getComputedStyle(el).position === 'fixed' && r.left >= vw) continue
    // Clipped by an ancestor that hides or scrolls its overflow inside the viewport.
    let clipped = false
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a)
      if (/(hidden|clip|auto|scroll)/.test(cs.overflowX) && a.getBoundingClientRect().right <= vw + 1) { clipped = true; break }
    }
    if (!clipped) wide.push(el)
  }
  // The deepest ones: a parent that sticks out only because its child does is not named.
  for (const el of wide.filter((e) => !wide.some((o) => o !== e && e.contains(o))).slice(0, 5)) {
    out.push({ rule: 'M6', element: window.__ux.d(el), value: Math.round(el.getBoundingClientRect().right), limit: vw })
  }
  return out
}

/**
 * M7: target size. Touch: at least `min` (44) on both sides. Fine pointer: at least
 * 24, or 24 px of space to every other target (the spacing exception as the
 * design-system rule words it, stricter than WCAG 2.2 2.5.8's circle); inline links
 * in running text are exempt.
 */
export function targetSize([min, fine]) {
  const out = []
  const all = [...document.querySelectorAll(window.__ux.targets)].filter((el) => {
    if (el.closest('[role="option"]') && el.getAttribute('role') !== 'option') return false
    if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') return false
    return window.__ux.shown(el)
  })
  const boxOf = (el) => {
    const t = el.getAttribute('type')
    return (el.tagName === 'INPUT' && (t === 'checkbox' || t === 'radio') ? el.closest('label') ?? el : el).getBoundingClientRect()
  }
  const boxes = all.map(boxOf)
  const seen = new Set()
  all.forEach((el, i) => {
    const r = boxes[i]
    if (r.width + 0.5 >= min && r.height + 0.5 >= min) return
    if (fine) {
      // Spacing exception: at least 24 px of gap to every other target.
      const clear = boxes.every((b, j) => {
        if (j === i || all[j].contains(el) || el.contains(all[j])) return true
        const dx = Math.max(b.left - r.right, r.left - b.right, 0), dy = Math.max(b.top - r.bottom, r.top - b.bottom, 0)
        return Math.max(dx, dy) >= 24
      })
      if (clear) return
    }
    const key = window.__ux.d(el)
    if (seen.has(key)) return
    seen.add(key)
    out.push({ rule: 'M7', element: key, value: `${Math.round(r.width)}×${Math.round(r.height)}`, limit: min })
  })
  return out.slice(0, 15)
}

/** M10: text cut with an ellipsis whose full text is in no accessible name, tooltip or sr-only neighbour. */
export function truncation() {
  const out = []
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length > 2 || !norm(el.textContent)) continue
    const cs = getComputedStyle(el)
    const clamped = cs.webkitLineClamp && cs.webkitLineClamp !== 'none'
    if (cs.textOverflow !== 'ellipsis' && !clamped) continue
    if (!(el.scrollWidth > el.clientWidth + 1 || (clamped && el.scrollHeight > el.clientHeight + 1))) continue
    if (!window.__ux.shown(el)) continue
    const text = norm(el.textContent)
    const carries = (n) => {
      if (!n || n.nodeType !== 1) return false
      const label = norm(n.getAttribute('aria-label')) + ' ' + norm(n.getAttribute('data-tip')) + ' ' + norm(n.getAttribute('title'))
      if (label.includes(text)) return true
      for (const id of (n.getAttribute('aria-labelledby') || '').split(' ')) if (id && norm(document.getElementById(id)?.textContent).includes(text)) return true
      return false
    }
    let ok = false
    for (let a = el; a && a !== document.body && !ok; a = a.parentElement) ok = carries(a)
    // A control named by its content (no aria-label) is announced with the whole text.
    const control = el.closest('a[href], button, [role="button"], [role="link"], [role="option"], [role="menuitem"], [role="tab"], [role="gridcell"]')
    if (!ok && control && !control.hasAttribute('aria-label') && !control.hasAttribute('aria-labelledby')) ok = norm(control.textContent).includes(text)
    if (!ok) ok = [...(el.parentElement?.children ?? [])].some((s) => s !== el && s.classList.contains('sr-only') && norm(s.textContent).includes(text))
    if (!ok) out.push({ rule: 'M10', element: window.__ux.d(el), value: text.slice(0, 60), limit: 'full text reachable' })
    if (out.length >= 10) break
  }
  return out
}

/**
 * M11: visible interactive controls overlapping by more than 4 px on both axes. Controls
 * in different layers (the page and an open menu, dialog, sheet or list of options) are
 * not compared: a control under an open overlay is covered, not visible (ux-fixes-phone).
 */
export function overlaps() {
  const out = []
  const LAYER = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="tooltip"], dialog'
  const els = [...document.querySelectorAll(window.__ux.targets)].filter((el) => window.__ux.shown(el))
  const boxes = els.map((el) => el.getBoundingClientRect())
  const layers = els.map((el) => el.closest(LAYER))
  for (let i = 0; i < els.length; i++) {
    for (let j = i + 1; j < els.length; j++) {
      if (els[i].contains(els[j]) || els[j].contains(els[i])) continue
      if (layers[i] !== layers[j]) continue
      const a = boxes[i], b = boxes[j]
      const x = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (x > 4 && y > 4) {
        // Only when one is painted over the other at the overlap's centre.
        const hit = document.elementFromPoint(Math.max(a.left, b.left) + x / 2, Math.max(a.top, b.top) + y / 2)
        if (hit && (els[i].contains(hit) || els[j].contains(hit))) out.push({ rule: 'M11', element: `${window.__ux.d(els[i])} × ${window.__ux.d(els[j])}`, value: `${Math.round(x)}×${Math.round(y)}`, limit: 4 })
      }
      if (out.length >= 8) return out
    }
  }
  return out
}

/**
 * M12, installed before load: sums layout-shift entries without recent input, and
 * keeps how much each moved element contributed, so the report names what moved.
 */
export const LAYOUT_SHIFT_INIT = `window.__cls = 0; window.__clsBy = {}; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (e.hadRecentInput) continue; window.__cls += e.value; for (const s of e.sources || []) { const n = s.node; const k = n && n.nodeType === 1 ? '<' + n.tagName.toLowerCase() + [...n.classList].slice(0, 2).map((c) => '.' + c).join('') + (n.id ? '#' + n.id : '') + '>' : '#text'; window.__clsBy[k] = (window.__clsBy[k] || 0) + e.value / e.sources.length } } }).observe({ type: 'layout-shift', buffered: true }) } catch {}`
export function layoutShift(limit) {
  const v = Math.round((window.__cls ?? 0) * 1000) / 1000
  const by = Object.entries(window.__clsBy ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k).join(', ')
  return v > limit ? [{ rule: 'M12', element: by || 'page', value: v, limit }] : []
}

/** M15: running animations or transitions that move or scale an element. */
export function movingAnimations() {
  const MOVING = /^(transform|translate|scale|rotate|width|height|top|left|right|bottom|inline-size|block-size|margin|inset)/
  const out = []
  for (const a of document.getAnimations()) {
    if (a.playState !== 'running') continue
    const target = a.effect?.target
    const props = new Set()
    if (a.transitionProperty) props.add(a.transitionProperty)
    for (const k of a.effect?.getKeyframes?.() ?? []) for (const p of Object.keys(k)) if (!['offset', 'easing', 'composite', 'computedOffset'].includes(p)) props.add(p)
    const moving = [...props].filter((p) => MOVING.test(p.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())))
    if (moving.length && target && target.nodeType === 1) out.push({ rule: 'M15', element: window.__ux.d(target), value: moving.join(', '), limit: 'none under reduced motion' })
  }
  return out.slice(0, 8)
}

/**
 * M15 over a moment (motion-polish D4): from now until motionSeen(), records every
 * transition that starts on a moving property and every running animation that
 * moves, polled each frame, so a short movement that ends before a snapshot is caught.
 */
export function watchMotion() {
  const MOVING = /^(transform|translate|scale|rotate|width|height|top|left|right|bottom|inline-size|block-size|margin|inset)/
  const seen = new Map()
  const note = (el, what) => {
    if (!el || el.nodeType !== 1) return
    const key = `${window.__ux.d(el)}|${what}`
    if (!seen.has(key)) seen.set(key, { rule: 'M15', element: window.__ux.d(el), value: what, limit: 'none under reduced motion' })
  }
  const onRun = (e) => { if (MOVING.test(e.propertyName)) note(e.target, e.propertyName) }
  document.addEventListener('transitionrun', onRun, true)
  let on = true
  const poll = () => {
    if (!on) return
    for (const a of document.getAnimations()) {
      if (a.playState !== 'running') continue
      const props = new Set()
      if (a.transitionProperty) props.add(a.transitionProperty)
      for (const k of a.effect?.getKeyframes?.() ?? []) for (const p of Object.keys(k)) if (!['offset', 'easing', 'composite', 'computedOffset'].includes(p)) props.add(p.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()))
      const moving = [...props].filter((p) => MOVING.test(p))
      if (moving.length) note(a.effect?.target, moving.join(', '))
    }
    requestAnimationFrame(poll)
  }
  requestAnimationFrame(poll)
  window.__motionStop = () => { on = false; document.removeEventListener('transitionrun', onRun, true); return [...seen.values()].slice(0, 8) }
}
export function motionSeen() {
  return window.__motionStop ? window.__motionStop() : []
}

// ---------------------------------------------------------------- driven from Node
/**
 * M8: Tab through the page and report focusable elements that, while focused, show
 * no outline or box-shadow (on themselves or the two nearest ancestors) that differs
 * from how they look unfocused.
 */
export async function focusWalk(page, maxSteps = 80) {
  await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0) })
  const seen = new Set()
  const out = []
  for (let i = 0; i < maxSteps; i++) {
    await page.keyboard.press('Tab')
    const r = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      const key = el.id || window.__ux.d(el) + ':' + Math.round(el.getBoundingClientRect().top)
      // The element and its two nearest ancestors (a ring drawn by focus-within), focused and not.
      const chain = [el, el.parentElement, el.parentElement?.parentElement].filter((n) => n && n.nodeType === 1)
      const look = () => chain.map((n) => { const cs = getComputedStyle(n); return [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.borderColor, cs.backgroundColor].join('|') })
      const focused = look()
      const ring = chain.some((n) => { const cs = getComputedStyle(n); return (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none') })
      el.blur()
      const resting = look()
      el.focus({ preventScroll: true })
      const changed = focused.some((v, i) => v !== resting[i])
      return { key, name: window.__ux.d(el), shown: ring && changed, visible: window.__ux.shown(el) }
    })
    if (!r) continue
    if (seen.has(r.key)) break
    seen.add(r.key)
    if (r.visible && !r.shown) out.push({ rule: 'M8', element: r.name, value: 'no ring', limit: 'token ring' })
  }
  await page.keyboard.press('Escape').catch(() => {})
  return out.slice(0, 10)
}
