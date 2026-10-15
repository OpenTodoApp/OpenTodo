// One screenshot per workbench story × theme × width, cropped to the story root.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

const root = process.env.STORYBOOK_DIR ?? join(__dirname, '../../web/storybook-static')
const index = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8')) as { entries: Record<string, { id: string; type: string; tags?: string[] }> }
// Stories tagged `no-visual` (for example every accent theme, OpenSpec theming) are
// checked by the a11y gate only, so CI keeps one baseline set: default theme, light and dark.
const ids = Object.values(index.entries).filter((e) => e.type === 'story' && !e.tags?.includes('no-visual')).map((e) => e.id)

for (const id of ids) {
  for (const theme of ['light', 'dark']) {
    for (const width of [375, 1280]) {
      test(`${id} ${theme} ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 })
        const url = `/iframe.html?id=${id}&viewMode=story&globals=theme:${theme};width:${width}`
        await page.goto(url)
        const story = page.locator('#storybook-root')
        // Rendered, not necessarily with text (an input, an icon-only trigger).
        await page.locator('#storybook-root > *').first().waitFor()
        // A chunk the static server did not deliver in time renders Storybook's error page
        // ("Failed to fetch dynamically imported module"); one reload gets the story.
        if (await page.locator('#storybook-root h1', { hasText: 'Failed to fetch' }).count()) {
          await page.goto(url)
          await page.locator('#storybook-root > *').first().waitFor()
        }
        await page.evaluate(() => document.fonts.ready)
        // An open menu or dialog renders in a portal outside the story root: capture the viewport.
        const overlay = await page.locator('[data-overlay]').count()
        await expect(overlay ? page : story).toHaveScreenshot(`${id}--${theme}-${width}.png`)
      })
    }
  }
}
