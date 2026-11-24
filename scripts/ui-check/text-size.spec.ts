// Text size at the largest step on a phone (OpenSpec change text-size, task 3.1; GitHub
// issue 1414; WCAG 1.4.4 Resize text): at 360 px with the root at 150 %, the shell's
// rows, tab bar and add button, a bottom sheet and the Appearance settings keep every
// control inside the viewport, no two controls overlap, the page never scrolls sideways
// and the tab bar's names are whole. The root scale is the one src/lib/textSize.ts writes.
import { expect, test, type Page } from '@playwright/test'

const WIDTH = 360
const LARGEST = 1.5

const STORIES = [
  { name: 'the Inbox with the tab bar', id: 'screens-shell--list-only', ready: 'li[data-task-id]' },
  { name: 'a bottom sheet', id: 'ui-overlay--dialog-bottom', ready: '[role="dialog"]' },
  { name: 'Settings → Appearance', id: 'settings-app-appearance--default', ready: '#appearance-text-size-select' },
]

async function open(page: Page, id: string, ready: string) {
  await page.setViewportSize({ width: WIDTH, height: 740 })
  await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=theme:light`)
  await page.locator(ready).first().waitFor()
  // After the story's decorators have set up the root, as the app's hook does after start.
  await page.evaluate((s) => { document.documentElement.style.setProperty('--ot-text-scale', String(s)) }, LARGEST)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  await page.evaluate(() => document.fonts.ready)
}

/** Every visible control: its box and a name for the failure message. */
function controls(page: Page) {
  return page.evaluate(() => {
    const sel = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="radio"], [role="tab"], [role="switch"], [role="menuitem"], [role="option"]'
    const out: { name: string; left: number; right: number; top: number; bottom: number; el: number; shown: boolean; fixed: boolean }[] = []
    const els = [...document.querySelectorAll<HTMLElement>(sel)]
    els.forEach((el, i) => {
      const b = el.getBoundingClientRect()
      const st = getComputedStyle(el)
      if (b.width < 1 || b.height < 1 || st.visibility === 'hidden' || el.closest('.sr-only, [aria-hidden="true"], [inert]')) return
      // A control in a sideways scroller (theme tiles) may sit beyond the edge on purpose.
      if (el.closest('[data-scroll-x]')) return
      // Shown: the control is what a tap at its centre reaches (a row scrolled under the tab bar is not).
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
      const shown = !!hit && (el.contains(hit) || hit.contains(el))
      // On the fixed chrome (the tab bar, the add button), which the list scrolls under by design.
      let fixed = false
      for (let n: HTMLElement | null = el; n && !fixed; n = n.parentElement) fixed = getComputedStyle(n).position === 'fixed'
      out.push({ name: (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 40) || el.tagName, left: b.left, right: b.right, top: b.top, bottom: b.bottom, el: i, shown, fixed })
    })
    const nested = new Set<string>()
    for (const a of out) for (const b of out) if (a !== b && els[a.el].contains(els[b.el])) nested.add(`${a.el}:${b.el}`)
    return { out, nested: [...nested], scrollWidth: document.documentElement.scrollWidth }
  })
}

for (const story of STORIES) {
  test(`${story.name} at the largest text size at ${WIDTH} px`, async ({ page }) => {
    await open(page, story.id, story.ready)
    expect(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))).toBeCloseTo(16 * LARGEST, 1)
    const { out, nested, scrollWidth } = await controls(page)
    expect(out.length).toBeGreaterThan(0)
    expect(scrollWidth, 'the page does not scroll sideways').toBeLessThanOrEqual(WIDTH)
    for (const c of out) {
      expect(c.left, `${c.name} starts inside the viewport`).toBeGreaterThanOrEqual(-0.5)
      expect(c.right, `${c.name} ends inside the viewport`).toBeLessThanOrEqual(WIDTH + 0.5)
    }
    const skip = new Set(nested)
    const shown = out.filter((c) => c.shown)
    const overlaps: string[] = []
    // Neighbouring rows' title targets meet by a few pixels at every size (2 px at 100 %); more is an overlap.
    const MEET = 4
    for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) {
      const a = shown[i], b = shown[j]
      if (a.fixed !== b.fixed || skip.has(`${a.el}:${b.el}`) || skip.has(`${b.el}:${a.el}`)) continue
      const x = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (x > MEET && y > MEET) overlaps.push(`${a.name} / ${b.name}`)
    }
    expect(overlaps, 'no two controls overlap').toEqual([])
  })
}

test(`the tab bar's names and the page title are whole at the largest text size at ${WIDTH} px`, async ({ page }) => {
  await open(page, 'screens-shell--list-only', '[data-tab-bar]')
  const cut = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-tab-bar] [data-tab] > span, [data-phone-bar] [data-phone-title]')]
    .filter((s) => s.scrollWidth > s.clientWidth + 0.5).map((s) => s.textContent))
  expect(cut).toEqual([])
})
