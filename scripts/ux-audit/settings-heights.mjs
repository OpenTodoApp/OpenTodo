// Settings page heights (OpenSpec change settings-subpages): opens every Settings
// section and every sub-page as the owner of a throwaway server with every owner
// feature on (the audit's seeded account plus the switches and environment
// overrides below), at 1280×800 and 390×844, and prints how tall each page is in
// pixels and in screens. A page should stay within about 1.5 screens.
//
//   node scripts/ux-audit/settings-heights.mjs          against bin/opentodo
//
// Env: OPENTODO_BIN (bin/opentodo), CHROMIUM_PATH, TEXT_SIZE (16), JSON=1 (print JSON),
// LIMIT (1.5 screens; with STRICT=1 the script exits 1 when a page is taller),
// SHOTS=<dir> (a screenshot of each whole page), THEME=dark, DEBUG=1 (progress on stderr).
// Pages are found by following the links of the section list (`data-settings-link`)
// and of each overview (`data-settings-subpage`), so new sub-pages are measured
// without changing this file. Changes nothing in the repository.
const pw = await import('playwright').catch(async () => {
  const { createRequire } = await import('node:module')
  const { execSync } = await import('node:child_process')
  return createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')
})
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { seed } from './seed.mjs'

const BIN = process.env.OPENTODO_BIN ?? 'bin/opentodo'
const TEXT_SIZE = Number(process.env.TEXT_SIZE ?? 16)
const LIMIT = Number(process.env.LIMIT ?? 1.5)
const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const t0 = Date.now()
const debug = (...a) => { if (process.env.DEBUG) console.error(`${((Date.now() - t0) / 1000).toFixed(1)}s`, ...a) }
const SIZES = [{ width: 1280, height: 800, touch: false }, { width: 390, height: 844, touch: true }]

// Every owner feature on: the switches the environment presets, and a configured
// mailer, speech service, single sign-on provider and email-to-task mailbox. The
// addresses are never reached during a measurement (example.invalid).
const FEATURES = {
  OPENTODO_CALENDAR_FEEDS: 'true', OPENTODO_CALDAV: 'true', OPENTODO_MAPS: 'on', OPENTODO_WEBHOOKS_ALLOW_PRIVATE: 'true',
  OPENTODO_SMTP_HOST: 'smtp.example.invalid', OPENTODO_SMTP_FROM: 'OpenTodo <todo@example.invalid>',
  OPENTODO_STT_URL: 'https://stt.example.invalid/v1', OPENTODO_STT_MODEL: 'whisper-1',
  OPENTODO_OIDC_ISSUER: 'https://id.example.invalid', OPENTODO_OIDC_CLIENT_ID: 'opentodo', OPENTODO_OIDC_CLIENT_SECRET: 'secret',
  OPENTODO_EMAIL_IMAP_HOST: 'imap.example.invalid:993', OPENTODO_EMAIL_IMAP_USER: 'todo', OPENTODO_EMAIL_IMAP_PASSWORD: 'secret',
  OPENTODO_EMAIL_ADDRESS: 'todo@example.invalid', OPENTODO_EMAIL_POLL_SECONDS: '3600',
}

const freePort = () => new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)) }) })
const dataDir = mkdtempSync(join(tmpdir(), 'opentodo-settings-heights-'))
const port = await freePort()
const base = `http://127.0.0.1:${port}`
const server = spawn(BIN, [], { env: { ...process.env, ...FEATURES, OPENTODO_ADDR: `127.0.0.1:${port}`, OPENTODO_DATA_DIR: dataDir }, stdio: 'ignore' })
let llm = null
const cleanup = () => { if (server.exitCode === null) server.kill(); llm?.close(); rmSync(dataDir, { recursive: true, force: true }) }
process.on('exit', cleanup)
for (let i = 0; ; i++) {
  try { if ((await fetch(`${base}/healthz`)).ok) break } catch { /* starting */ }
  if (i > 100) throw new Error(`${BIN} did not start on ${base}`)
  await new Promise((r) => setTimeout(r, 100))
}

debug('seeding')
const seeded = await seed({ base, pw })
debug('seeded')
llm = seeded.llm
const browser = await pw.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
{
  // The switches without an environment override, and a second webhook and app password.
  const ctx = await browser.newContext({ storageState: seeded.storageState })
  const put = (path, body, method = 'PUT') => ctx.request.fetch(base + path, { method, headers: { Origin: base, 'Content-Type': 'application/json' }, data: JSON.stringify(body) })
  await put('/api/v1/settings/issues', { enabled: true })
  await put('/api/v1/settings/notification-channels', { enabled: true })
  await put('/api/v1/settings/automations', { enabled: true })
  await put('/api/v1/settings/project-invites', { membersCanInviteNewPeople: true })
  await put('/api/v1/webhooks', { url: 'https://n8n.example.invalid/webhook/tasks', events: ['task.created'] }, 'POST')
  await put('/api/v1/app-passwords', { name: 'iPhone Reminders' }, 'POST')
  await ctx.close()
}

/** Height of the page's scrolling content: the shell's scroller, or the document. */
const pageHeight = () => {
  const section = document.querySelector('[data-settings-section]') ?? document.querySelector('[data-settings-overview]')
  let el = section?.parentElement
  while (el && el !== document.body) {
    const s = getComputedStyle(el)
    if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) return el.scrollHeight
    el = el.parentElement
  }
  return document.scrollingElement.scrollHeight
}

async function settle(p) {
  await p.locator('[data-settings-section], [data-settings-overview]').first().waitFor({ timeout: 10000 }).catch(() => {})
  await p.locator('[data-settings-settling]').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {})
  await p.waitForTimeout(700)
}

const rows = []
for (const size of SIZES) {
  const ctx = await browser.newContext({ storageState: seeded.storageState, viewport: { width: size.width, height: size.height }, hasTouch: size.touch, isMobile: size.touch, colorScheme: process.env.THEME === 'dark' ? 'dark' : 'light' })
  const p = await ctx.newPage()
  if (TEXT_SIZE !== 16) {
    const cdp = await ctx.newCDPSession(p)
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: TEXT_SIZE, fixed: Math.round(TEXT_SIZE * 13 / 16) } }).catch(() => {})
  }
  await p.goto(`${base}/settings`)
  await p.locator('[data-settings-link]').first().waitFor()
  const sections = await p.locator('[data-settings-link]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')))])
  const queue = [...sections]
  const seen = new Set()
  while (queue.length) {
    const path = queue.shift()
    if (seen.has(path)) continue
    seen.add(path)
    debug('open', size.width, path)
    await p.goto(base + path, { waitUntil: 'domcontentloaded' })
    await settle(p)
    const height = await p.evaluate(pageHeight)
    rows.push({ width: size.width, path, height, screens: +(height / size.height).toFixed(2) })
    if (SHOTS) {
      await p.setViewportSize({ width: size.width, height: Math.min(height + 80, 8000) })
      await p.waitForTimeout(200)
      await p.screenshot({ path: join(SHOTS, `${size.width}${path.replaceAll('/', '_')}.png`) })
      await p.setViewportSize({ width: size.width, height: size.height })
    }
    const subs = await p.locator('[data-settings-subpage]').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
    queue.unshift(...subs.filter((s) => !seen.has(s)))
  }
  await ctx.close()
}
await browser.close()

if (process.env.JSON === '1') console.log(JSON.stringify(rows, null, 2))
else {
  const paths = [...new Set(rows.map((r) => r.path))]
  const cell = (r) => (r ? `${r.height} px (${r.screens})${r.screens > LIMIT ? ' *' : ''}` : '-')
  console.log(`| Page | ${SIZES.map((s) => `${s.width}×${s.height}`).join(' | ')} |`)
  console.log(`|---|${SIZES.map(() => '---').join('|')}|`)
  for (const path of paths) console.log(`| \`${path}\` | ${SIZES.map((s) => cell(rows.find((r) => r.path === path && r.width === s.width))).join(' | ')} |`)
  console.log(`\n* taller than ${LIMIT} screens`)
}
const over = rows.filter((r) => r.screens > LIMIT)
process.exitCode = process.env.STRICT === '1' && over.length ? 1 : 0
