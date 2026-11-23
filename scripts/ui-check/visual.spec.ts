// One screenshot per workbench story × theme × width, cropped to the story root.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test as base, type BrowserContext, type Page } from '@playwright/test'

const root = process.env.STORYBOOK_DIR ?? join(__dirname, '../../web/storybook-static')
const index = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8')) as { entries: Record<string, { id: string; type: string; tags?: string[] }> }
// Stories tagged `no-visual` (for example every accent theme, OpenSpec theming) are
// checked by the a11y gate only, so CI keeps one baseline set: default theme, light and dark.
const ids = Object.values(index.entries).filter((e) => e.type === 'story' && !e.tags?.includes('no-visual')).map((e) => e.id)

// Stories that need a fresh load for each capture, not only for each width: an in-place
// theme change renders them differently. One line each, with the reason.
const RELOAD = new Set<string>([
  'screens-task-list--inbox-split-selected', // the selected task in the split differs after an in-place theme change
  'screens-task-list--project-side-panel-selected', // the selected task in the side panel differs after an in-place theme change
])

// One page per worker (ci-speed): a story loads once per width, and its dark capture changes
// the theme global in place, half the loads of a load per capture. The width always gets a
// fresh load: many stories pick their layout, or place a menu, when they mount. A worker that
// a failure replaced starts with an empty page and loads again.
const test = base.extend<object, { shared: { page: Page; story: string | null; fresh: () => Promise<Page> } }>({
  shared: [async ({ browser }, use, workerInfo) => {
    // A new context for every story load, as each test had before: no storage, database or
    // cookies carry from one story to the next.
    let context: BrowserContext | null = null
    const shared = {
      page: null as unknown as Page,
      story: null as string | null,
      fresh: async () => {
        await context?.close()
        context = await browser.newContext({ baseURL: workerInfo.project.use.baseURL, locale: 'en-US' })
        shared.page = await context.newPage()
        return shared.page
      },
    }
    await use(shared)
    await context?.close()
  }, { scope: 'worker' }],
})

async function load(page: Page, url: string) {
  await page.goto(url)
  // Rendered, not necessarily with text (an input, an icon-only trigger).
  await page.locator('#storybook-root > *').first().waitFor()
  // A chunk the static server did not deliver in time renders Storybook's error page
  // ("Failed to fetch dynamically imported module"); one reload gets the story.
  if (await page.locator('#storybook-root h1', { hasText: 'Failed to fetch' }).count()) {
    await page.goto(url)
    await page.locator('#storybook-root > *').first().waitFor()
  }
}

// The decorator sets data-theme on the document and on the story's frame: wait for Storybook
// to render the new theme global, then for both to show it.
type Channel = { on: (e: string, f: () => void) => void; off: (e: string, f: () => void) => void; emit: (e: string, a: unknown) => void }
async function restyle(page: Page, theme: string) {
  await page.evaluate((theme) => new Promise<void>((resolve, reject) => {
    const channel = (window as unknown as { __STORYBOOK_ADDONS_CHANNEL__: Channel }).__STORYBOOK_ADDONS_CHANNEL__
    const off = () => { channel.off('storyRendered', done); channel.off('storyErrored', failed); channel.off('storyThrewException', failed) }
    const done = () => { off(); resolve() }
    const failed = () => { off(); reject(new Error('the story failed to render')) }
    channel.on('storyRendered', done)
    channel.on('storyErrored', failed)
    channel.on('storyThrewException', failed)
    channel.emit('updateGlobals', { globals: { theme } })
  }), theme)
  await page.waitForFunction((theme) => {
    const frame = document.querySelector<HTMLElement>('#storybook-root > [data-theme]')
    return document.documentElement.dataset.theme === theme && frame?.dataset.theme === theme
  }, theme)
  // A load starts at the top; so does every capture.
  await page.evaluate(() => window.scrollTo(0, 0))
}

for (const id of ids) {
  // The four captures of a story run in order in one worker, so they share its page.
  test.describe(id, () => {
    test.describe.configure({ mode: 'default' })
    for (const width of [375, 1280]) {
      for (const theme of ['light', 'dark']) {
        test(`${id} ${theme} ${width}`, async ({ shared }) => {
          const restyled = shared.story === `${id} ${width}` && !RELOAD.has(id)
          shared.story = null
          const page = restyled ? shared.page : await shared.fresh()
          await page.setViewportSize({ width, height: 800 })
          if (restyled) await restyle(page, theme)
          else await load(page, `/iframe.html?id=${id}&viewMode=story&globals=theme:${theme};width:${width}`)
          shared.story = `${id} ${width}`
          const story = page.locator('#storybook-root')
          await page.evaluate(() => document.fonts.ready)
          // A story that scripts its state after mounting (opens a menu, focuses a row) marks
          // itself data-story-pending until that state is in place; wait for it before capturing.
          await page.locator('[data-story-pending]').waitFor({ state: 'detached', timeout: 5000 })
          // An open menu or dialog renders in a portal outside the story root: capture the viewport.
          const overlay = await page.locator('[data-overlay]').count()
          await expect(overlay ? page : story).toHaveScreenshot(`${id}--${theme}-${width}.png`)
        })
      }
    }
  })
}
