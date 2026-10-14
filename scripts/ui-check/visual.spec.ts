// One screenshot per workbench story × theme × width, cropped to the story root.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

const root = process.env.STORYBOOK_DIR ?? join(__dirname, '../../web/storybook-static')
const index = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8')) as { entries: Record<string, { id: string; type: string }> }
const ids = Object.values(index.entries).filter((e) => e.type === 'story').map((e) => e.id)

for (const id of ids) {
  for (const theme of ['light', 'dark']) {
    for (const width of [375, 1280]) {
      test(`${id} ${theme} ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 })
        await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=theme:${theme};width:${width}`)
        const story = page.locator('#storybook-root')
        await expect(story).not.toBeEmpty()
        await page.evaluate(() => document.fonts.ready)
        await expect(story).toHaveScreenshot(`${id}--${theme}-${width}.png`)
      })
    }
  }
}
