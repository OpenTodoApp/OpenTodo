// Row alignment over the static workbench (GitHub issue 945): in the story Screens/Task
// row ImportedAlignment, rows that end with an origin (an issue, a page, a Trello card's
// icon) or with nothing keep their date and label cells in one column at 1280 and 768 px,
// and the phone row's date ends at one place at 390 px. No import id is shown or read out.
import { expect, test } from '@playwright/test'

const IMPORT_IDS = /dfc92cb10aed05a4|32dc159c4ebf721d|5f3a9c1e2b7d4a00/

for (const width of [1280, 768, 390]) {
  test(`imported rows line up at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/iframe.html?id=screens-task-row--imported-alignment&viewMode=story&globals=theme:light')
    await page.locator('[data-alignment-list] > li[data-task-id]').first().waitFor()
    await page.evaluate(() => document.fonts.ready)
    const m = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-alignment-list] > li[data-task-id]')]
      const box = (row: Element, sel: string) => {
        const el = row.querySelector(sel)
        const b = el?.getBoundingClientRect()
        return b && b.width > 0 ? { left: b.left, right: b.right } : null
      }
      const named = [...document.querySelectorAll('[data-alignment-list] [aria-label], [data-alignment-list] [title]')]
        .map((el) => `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''}`)
      return {
        rows: rows.length,
        date: rows.map((r) => box(r, '[data-row-cell="date"]')),
        labels: rows.map((r) => box(r, '[data-row-cell="extra"]')),
        // textContent includes visually hidden text, which a screen reader reads.
        text: `${document.querySelector('[data-alignment-list]')!.textContent} ${named.join(' ')}`,
      }
    })
    expect(m.rows).toBe(6)
    expect(m.text).not.toMatch(IMPORT_IDS)
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs)
    const dates = m.date.filter((b) => b !== null)
    expect(dates).toHaveLength(6)
    if (width >= 768) {
      // The property column: the date and label cells start at one x on every row.
      const labels = m.labels.filter((b) => b !== null)
      expect(labels).toHaveLength(6)
      expect(spread(dates.map((b) => b.left))).toBeLessThanOrEqual(0.5)
      expect(spread(labels.map((b) => b.left))).toBeLessThanOrEqual(0.5)
    } else {
      // The phone's one line: the date ends the row at one x.
      expect(spread(dates.map((b) => b.right))).toBeLessThanOrEqual(0.5)
    }
  })
}
