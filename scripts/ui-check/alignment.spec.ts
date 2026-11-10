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
        labels: rows.map((r) => box(r, '[data-row-cell="labels"]')),
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

// The row grid (sidebar-brand-and-row-grid D2, D3): in the story Screens/Task row SlotGrid,
// rows with and without a label, an estimate or a date keep every slot in its column, the
// dates end at one x, and the title, the marks and every slot share the title's first baseline.
test('slots line up when values are missing, on the title\'s first baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/iframe.html?id=screens-task-row--slot-grid&viewMode=story&globals=theme:light')
  await page.locator('li[data-task-id]').first().waitFor()
  await page.evaluate(() => document.fonts.ready)
  const m = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('li[data-task-id]')]
    const cell = (row: Element, slot: string) => {
      const b = row.querySelector(`[data-row-cell="${slot}"]`)?.getBoundingClientRect()
      return b && b.width > 0 ? { left: b.left, right: b.right } : null
    }
    // The bottom of a text's first line box: equal bottoms at one size mean one baseline.
    const base = (el: Element | null) => {
      if (!el) return null
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent!.trim() && !n.parentElement!.closest('.sr-only') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) })
      const n = walker.nextNode()
      if (!n) return null
      const r = document.createRange()
      r.selectNodeContents(n)
      return r.getClientRects()[0].bottom
    }
    return rows.map((r) => ({
      date: cell(r, 'date'), labels: cell(r, 'labels'), project: cell(r, 'project'),
      title: base(r.querySelector('[data-row-title]')),
      textBases: ['date', 'labels', 'project', 'estimate'].map((s) => base(r.querySelector(`[data-row-cell="${s}"]`))).filter((x) => x !== null) as number[],
      marks: base(r.querySelector('[data-row-marks] [data-row-counts]')),
    }))
  })
  const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs)
  const dates = m.map((r) => r.date).filter((b) => b !== null)
  expect(dates.length).toBeGreaterThanOrEqual(3)
  expect(spread(dates.map((b) => b.right))).toBeLessThanOrEqual(0.5)
  const labels = m.map((r) => r.labels).filter((b) => b !== null)
  expect(labels.length).toBeGreaterThanOrEqual(2)
  expect(spread(labels.map((b) => b.left))).toBeLessThanOrEqual(0.5)
  const projects = m.map((r) => r.project).filter((b) => b !== null)
  expect(spread(projects.map((b) => b.left))).toBeLessThanOrEqual(0.5)
  for (const r of m) {
    // The metadata size is a little smaller than the title's: its first line ends within a pixel and a half.
    for (const b of r.textBases) expect(Math.abs(b - r.title!)).toBeLessThanOrEqual(1.5)
    if (r.marks !== null) expect(Math.abs(r.marks - r.title!)).toBeLessThanOrEqual(1.5)
  }
})
