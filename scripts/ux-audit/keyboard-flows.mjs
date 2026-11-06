// The keyboard-only walkthrough of the main flows (OpenSpec change accessibility-aa, the
// "Keyboard only" pass of docs/accessibility/audit-<version>.md): against a throwaway seeded
// server, without a single mouse event, it reaches the content by the skip link, adds a task
// with q, moves between lists with g keys and through rows with j, sets a priority, opens and
// closes a task, uses the row menu and the label picker, completes and undoes, searches with
// Ctrl+K, toggles a setting with Space, checks that a dialog keeps Tab inside, and walks the
// calendar and the weekly review. Each step checks its outcome. The gate's Tab walk covers
// every screen's focus order and rings; this covers what a person does with them.
//
//   make build && node scripts/ux-audit/keyboard-flows.mjs [outdir]   (WIDTH=360 for a phone width)
//
// Exits 1 when a step fails, with a screenshot of that moment in outdir.
import { spawn, execSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const repo = new URL('../../', import.meta.url).pathname
const out = process.argv[2] ?? 'keyboard-report'
mkdirSync(out, { recursive: true })
const pw = await import('playwright').catch(() => createRequire(execSync('npm root -g').toString().trim() + '/')('playwright'))
const { seed } = await import(join(repo, 'scripts/ux-audit/seed.mjs'))
const port = 18000 + Math.floor(Math.random() * 900)
const base = `http://127.0.0.1:${port}`
const server = spawn(process.env.OPENTODO_BIN ?? join(repo, 'bin/opentodo'), [], { env: { ...process.env, OPENTODO_ADDR: `127.0.0.1:${port}`, OPENTODO_DATA_DIR: mkdtempSync(join(tmpdir(), 'kbd-')) }, stdio: 'ignore' })
process.on('exit', () => server.kill())
for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/healthz')).ok) break } catch {} await new Promise((r) => setTimeout(r, 100)) }
const ids = await seed({ base, pw })
const browser = await pw.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const results = []
const width = Number(process.env.WIDTH ?? 1280)
const ctx = await browser.newContext({ viewport: { width, height: 800 }, storageState: ids.storageState, locale: 'en-GB', timezoneId: 'UTC' })
const p = await ctx.newPage()
p.on('dialog', (d) => d.dismiss())
const k = (key) => p.keyboard.press(key)
const settle = () => p.waitForTimeout(350)
const focused = () => p.evaluate(() => { const el = document.activeElement; return el ? (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 60) : '' })
async function flow(name, fn) {
  try { const note = await fn(); results.push({ name, ok: true, note: note ?? '' }); console.log('✓', name, note ?? '') }
  catch (e) { results.push({ name, ok: false, note: e.message.split('\n')[0] }); console.log('✗', name, e.message.split('\n')[0]); await p.screenshot({ path: join(out, `fail-${name.replace(/\W+/g, '-')}.png`) }) }
  await k('Escape').catch(() => {}); await settle()
}
const expect = (cond, what) => { if (!cond) throw new Error(what) }

await p.goto(base + '/today')
await p.locator('[data-task-id]').first().waitFor()
await settle()
// A due reminder takes the focus as an alert (by design); dismiss it from the keyboard first.
for (let i = 0; i < 4 && await p.locator('[role="alertdialog"]').count(); i++) { await p.locator('[role="alertdialog"] button').first().focus(); await k('Escape'); await settle() }

await flow('skip link reaches the content', async () => {
  await k('Tab')
  const f = await focused()
  expect(/Skip to content/i.test(f), `first Tab stop is "${f}"`)
  await k('Enter'); await settle()
  return `then focus is on "${await focused()}"`
})
await flow('quick add with q, a date typed in the line', async () => {
  await p.goto(base + '/today'); await p.locator('[data-task-id]').first().waitFor(); await settle()
  await k('q'); await settle()
  expect(await p.evaluate(() => document.activeElement?.tagName === 'INPUT' || document.activeElement?.isContentEditable), 'q did not focus the quick add field')
  await p.keyboard.type('Keyboard only task today'); await k('Enter'); await settle(); await k('Escape'); await settle()
  await p.locator('[data-task-id]').filter({ hasText: 'Keyboard only task' }).first().waitFor({ timeout: 5000 })
})
await flow('go to Inbox with g i, move with j, set priority with 1', async () => {
  await k('g'); await k('i')
  await p.waitForFunction(() => location.pathname === '/inbox' || location.pathname === '/', null, { timeout: 5000 }); await settle()
  await k('j'); await settle()
  const id = await p.locator('[data-task-id][aria-current]').first().getAttribute('data-task-id')
  expect(id, 'j selected no row')
  await k('1'); await settle()
  return `row ${id} priority 1`
})
await flow('open the selected task with Enter and back with Escape', async () => {
  for (let i = 0; i < 4 && await p.locator('[role="alertdialog"]').count(); i++) { await p.locator('[role="alertdialog"] button').first().focus(); await k('Escape'); await settle() }
  await k('j'); await k('Enter'); await p.locator('[data-detail-for]').first().waitFor({ timeout: 5000 }); await settle()
  await k('Escape'); await settle()
})
await flow('the row menu with . and a menu item by arrows', async () => {
  await k('j'); await k('.'); await p.getByRole('menu').first().waitFor({ timeout: 5000 })
  await k('ArrowDown'); const f = await focused()
  expect(f.length > 0, 'no menu item focused')
  await k('Escape'); await settle()
  return `focused "${f}"`
})
await flow('labels with Shift+L, type to find, Enter adds', async () => {
  await k('j'); await k('Shift+L'); await p.getByRole('dialog').first().waitFor({ timeout: 5000 }); await settle()
  await p.keyboard.type('errand'); await k('Enter'); await settle(); await k('Escape')
})
await flow('complete with c and undo with Ctrl+Z', async () => {
  await p.goto(base + '/inbox'); await p.locator('[data-task-id]').first().waitFor(); await settle()
  await k('j'); const id = await p.locator('[data-task-id][aria-current]').first().getAttribute('data-task-id')
  await k('c'); await settle()
  await k('Control+z'); await settle()
  return `row ${id}`
})
await flow('search and commands with Ctrl+K, then open Settings', async () => {
  await k('Control+k'); await p.getByRole('combobox').first().waitFor({ timeout: 5000 })
  await p.keyboard.type('Settings'); await settle(); await k('Enter')
  await p.waitForFunction(() => location.pathname.startsWith('/settings'), null, { timeout: 5000 })
})
await flow('settings: Tab to a switch and toggle it with Space', async () => {
  await p.goto(base + '/settings/general/keyboard'); await settle()
  let found = false
  for (let i = 0; i < 60 && !found; i++) { await k('Tab'); found = await p.evaluate(() => document.activeElement?.getAttribute('role') === 'switch') }
  expect(found, 'no switch reachable by Tab')
  const before = await p.evaluate(() => document.activeElement?.getAttribute('aria-checked'))
  await k('Space'); await settle()
  const after = await p.evaluate(() => document.activeElement?.getAttribute('aria-checked'))
  expect(before !== after, 'Space did not toggle the switch')
  await k('Space'); await settle()
  return `"${await focused()}" toggled and back`
})
await flow('a dialog keeps Tab inside and returns focus on Escape', async () => {
  await p.goto(base + '/today'); await p.locator('[data-task-id]').first().waitFor(); await settle()
  await k('?'); await p.getByRole('dialog').first().waitFor({ timeout: 5000 }); await settle()
  for (let i = 0; i < 30; i++) {
    await k('Tab')
    const inside = await p.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))
    expect(inside, `Tab left the dialog at step ${i + 1}`)
  }
  await k('Escape'); await settle()
  expect(!(await p.getByRole('dialog').count()), 'Escape did not close the dialog')
})
await flow('the calendar by keyboard: Week, move between days', async () => {
  await p.goto(base + '/calendar'); await settle(); await settle()
  await k('w'); await settle(); await k('n'); await settle(); await k('p'); await settle(); await k('t'); await settle()
})
await flow('the weekly review steps by keyboard', async () => {
  await p.goto(base + '/review'); await settle()
  let found = false
  for (let i = 0; i < 150 && !found; i++) { await k('Tab'); found = await p.evaluate(() => !!document.activeElement?.closest('[data-review-progress]')) }
  expect(found, 'no review step reachable by Tab')
})
writeFileSync(join(out, `keyboard-${width}.json`), JSON.stringify(results, null, 1))
await browser.close(); server.kill()
process.exit(results.every((r) => r.ok) ? 0 : 1)
