// Records the short demo GIF at the top of README.md (docs/screenshots/demo.gif):
// natural-language quick add with its chips, a project board with a card moved
// between sections, then the app keeps working offline and syncs on reconnect.
// Run it against a FRESH data directory; needs ffmpeg on PATH.
//
//   OPENTODO_DATA_DIR=$(mktemp -d) ./bin/opentodo &
//   node scripts/demo-gif.mjs [out.gif]
const { chromium } = await import('playwright').catch(async () => {
  const { createRequire } = await import('node:module')
  const { execSync } = await import('node:child_process')
  return createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')
})
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.env.OPENTODO_URL ?? 'http://127.0.0.1:8080'
const out = process.argv[2] ?? 'docs/screenshots/demo.gif'
const videoDir = mkdtempSync(join(tmpdir(), 'opentodo-gif-'))
const size = { width: 1100, height: 680 }

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
// Sign up and seed outside the recording, so the GIF starts on a ready app.
const setup = await browser.newContext({ viewport: size })
const sp = await setup.newPage()
await sp.goto(base)
await sp.getByText('Create the owner account').waitFor()
await sp.getByLabel('Name').fill('Ada')
await sp.getByLabel('Email').fill('ada@example.com')
await sp.getByLabel(/Password/).fill('correct horse battery staple')
await sp.getByRole('button', { name: 'Create owner account' }).click()
await sp.getByRole('combobox', { name: 'Add a task' }).waitFor()
const api = setup.request
const post = async (path, data) => (await api.post(`${base}/api/v1/${path}`, { data })).json()
const home = await post('projects', { name: 'Home renovation', color: '#10b981' })
const todo = await post('sections', { name: 'To do', project_id: home.id, position: 1 })
const doing = await post('sections', { name: 'Doing', project_id: home.id, position: 2 })
await post('sections', { name: 'Done', project_id: home.id, position: 3 })
for (const [title, section, p] of [['Pick paint colours', todo.id, 2], ['Order tiles', todo.id, 1], ['Measure the kitchen', doing.id, 3], ['Call the plumber', todo.id, 4]]) {
  await post('tasks', { title, project_id: home.id, section_id: section, priority: p })
}
const state = await setup.storageState()
await setup.close()

const ctx = await browser.newContext({ viewport: size, storageState: state, recordVideo: { dir: videoDir, size } })
const page = await ctx.newPage()
const pause = (ms) => page.waitForTimeout(ms)
await page.goto(base)
const quick = page.getByRole('combobox', { name: 'Add a task' })
await quick.waitFor()
await pause(800)

// 1. Natural-language quick add.
for (const text of ['Dentist next tuesday at 3pm p1 +30m', 'Order grout friday #Home']) {
  await quick.click()
  await quick.pressSequentially(text, { delay: 55 })
  await pause(900)
  await quick.press('Enter')
  await pause(700)
}

// 2. Board: switch the project to board view and move a card with the keyboard.
await page.locator('aside').getByRole('button', { name: /^Home renovation/ }).click()
await page.getByRole('heading', { name: 'Home renovation' }).waitFor()
await pause(500)
await page.keyboard.press('v')
await pause(900)
await page.getByRole('button', { name: /^Order tiles/ }).click()
await pause(300)
await page.keyboard.press('Escape') // close the detail panel; the card stays selected
await pause(400)
await page.keyboard.press('Shift+ArrowRight')
await pause(700)
await page.keyboard.press('Shift+ArrowRight')
await pause(1100)

// 3. Offline: keep working, then reconnect and sync.
await ctx.setOffline(true)
await pause(600)
await page.locator('aside').getByRole('button', { name: /Inbox/ }).first().click()
await pause(500)
await page.getByRole('combobox', { name: 'Add a task' }).click()
await page.getByRole('combobox', { name: 'Add a task' }).pressSequentially('Added while offline', { delay: 55 })
await page.getByRole('combobox', { name: 'Add a task' }).press('Enter')
await pause(1400)
await ctx.setOffline(false)
await page.getByText('Synced').first().waitFor({ timeout: 15000 }).catch(() => undefined)
await pause(1500)

await ctx.close()
await browser.close()

const webm = join(videoDir, readdirSync(videoDir).find((f) => f.endsWith('.webm')))
const palette = join(videoDir, 'palette.png')
const filters = 'fps=12,scale=880:-1:flags=lanczos'
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-vf', `${filters},palettegen=stats_mode=diff`, palette])
const tmpGif = join(videoDir, 'demo.gif')
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-i', palette, '-lavfi', `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`, tmpGif])
renameSync(tmpGif, out)
console.log('wrote', out)
