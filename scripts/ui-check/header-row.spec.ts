// A tool page's header is one row at desktop widths (app-shell "compact header"; GitHub issue
// 2134): a subtask with a 250-character title keeps the sidebar toggle, the path and Close,
// Task actions and Help on the line its short sibling uses, the title is cut inside the path,
// and the steps up (the project, the parent) keep their whole names.
import { expect, test, type Page } from '@playwright/test'

async function header(page: Page, id: string, width: number) {
  await page.setViewportSize({ width, height: 800 })
  await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=theme:light`)
  await page.locator('[data-page-header] [data-crumb="task"]').first().waitFor()
  await page.evaluate(() => document.fonts.ready)
  return page.evaluate(() => {
    const head = document.querySelector<HTMLElement>('[data-page-header]')!
    const box = (sel: string) => head.querySelector(sel)!.getBoundingClientRect()
    const mid = (r: DOMRect) => r.top + r.height / 2
    const crumbs = [...head.querySelectorAll<HTMLElement>('[data-crumb]:not([data-crumb="task"])')]
    return {
      height: head.offsetHeight,
      middles: ['[data-sidebar-toggle]', '[data-breadcrumb]', '[data-task-close]', '[data-help-screen]'].map((s) => mid(box(s))),
      // The text's own width against its box: an ellipsis can take a fraction of a pixel that scrollWidth rounds away.
      stepsCut: crumbs.some((c) => [...c.querySelectorAll('*'), c].some((el) => {
        const text = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim())
        if (!text) return false
        const range = document.createRange()
        range.selectNodeContents(text)
        const cs = getComputedStyle(el)
        const box = el.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth)
        return range.getBoundingClientRect().width > box + 0.01
      })),
      taskCut: ((el) => el.scrollWidth > el.clientWidth)(head.querySelector<HTMLElement>('[data-crumb="task"]')!),
    }
  })
}

for (const width of [1280, 1462]) {
  test(`a long subtask title keeps the task header on one row at ${width} px`, async ({ page }) => {
    const short = await header(page, 'screens-shell--task-page', width)
    const long = await header(page, 'screens-shell--long-subtask-page', width)
    expect(long.height).toBe(short.height)
    expect(Math.max(...long.middles) - Math.min(...long.middles)).toBeLessThanOrEqual(1)
    expect(long.taskCut).toBe(true)
    expect(long.stepsCut).toBe(false)
  })
}
