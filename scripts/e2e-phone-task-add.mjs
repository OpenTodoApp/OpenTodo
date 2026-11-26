// Issue #2105: list and board capture through the phone sheet. Starts its own
// throwaway server on a free port, never 8080. BASELINE=1 captures the old UI.
const { chromium, webkit, expect } = await import('@playwright/test').catch(async () => {
  const { createRequire } = await import('node:module')
  const { execSync } = await import('node:child_process')
  return createRequire(execSync('npm root -g').toString().trim() + '/')('@playwright/test')
})
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chooseLayout } from './ux-audit/layout-screens.mjs'

const baseline = process.env.BASELINE === '1'
const out = process.env.OUT_DIR ?? 'dist/issue-2105-after'
mkdirSync(out, { recursive: true })
const port = await new Promise((resolve) => {
  const socket = createServer()
  socket.listen(0, '127.0.0.1', () => {
    const port = socket.address().port
    socket.close(() => resolve(port))
  })
})
if (port === 8080) throw new Error('8080 is reserved for the existing service')
const base = `http://127.0.0.1:${port}`
const dir = mkdtempSync(join(tmpdir(), 'opentodo-2105-'))
const server = spawn(process.env.OPENTODO_BIN ?? 'bin/opentodo', [], {
  env: { ...process.env, OPENTODO_ADDR: `127.0.0.1:${port}`, OPENTODO_DATA_DIR: dir }, stdio: 'ignore',
})
let browser
try {
  await expect.poll(() => fetch(base + '/healthz').then((r) => r.status).catch(() => 0), { timeout: 30000 }).toBe(200)
  const engine = process.env.ENGINE === 'webkit' ? webkit : chromium
  browser = await engine.launch(process.env.ENGINE !== 'webkit' && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  const api = await browser.newContext()
  const post = async (path, data) => {
    const response = await api.request.post(base + path, { data })
    if (!response.ok()) throw new Error(`${path}: ${response.status()} ${await response.text()}`)
    return response.json()
  }
  await post('/api/v1/auth/register', { email: 'test@example.com', name: 'Test', password: 'correct horse battery staple' })
  const project = await post('/api/v1/projects', { name: 'Work' })
  const section = await post('/api/v1/sections', { name: 'Doing', project_id: project.id, position: 1 })
  await post('/api/v1/tasks', { title: 'Existing task', project_id: project.id, section_id: section.id })
  await post('/api/v1/tasks', { title: 'No section task', project_id: project.id })
  const state = await api.storageState()
  const saved = async (title) => {
    const response = await api.request.get(base + '/api/v1/tasks')
    const body = await response.json()
    const task = (Array.isArray(body) ? body : body.tasks ?? []).find((t) => t.title === title)
    // REST omits an unset optional section, while the local model uses null.
    return task ? { ...task, section_id: task.section_id ?? null } : undefined
  }

  for (const theme of ['light', 'dark']) for (const width of [390, 1280]) for (const phoneUi of (width < 768 ? [false, true] : [true])) {
    // The test injects axe-core; the application's own CSP remains unchanged.
    const context = await browser.newContext({ storageState: state, viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: width < 768, colorScheme: theme, bypassCSP: true })
    await context.addInitScript((on) => localStorage.setItem('opentodo.phoneUi', on ? '1' : '0'), phoneUi)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    const screenshot = async (name) => {
      await page.evaluate(() => Promise.all(document.getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
        .map((animation) => animation.finished.catch(() => {}))))
      await page.screenshot({ path: `${out}/${label}-${name}.png`, animations: 'disabled' })
    }
    await page.goto(`${base}/project/${project.id}`)
    const trigger = page.locator(`[data-section-heading="${section.id}"] button[aria-label="Add a task to Doing"]`)
    await expect(trigger).toBeVisible()
    const skip = page.getByRole('button', { name: 'Skip all', exact: true })
    if (await skip.isVisible()) await skip.click()
    const label = `${width}-${phoneUi ? 'new' : 'earlier'}-${theme}`
    const field = page.locator('[data-quick-add-sheet] textarea[aria-label="Add a task"]')
    await screenshot('list')
    await trigger.click()
    if (!baseline && width < 768) {
      await expect(field).toBeVisible()
      await expect(page.locator('[data-quick-add-row]')).toHaveCount(0)
      await expect(page.locator('textarea[aria-label="Add a task to Doing"]')).toHaveCount(0)
      await field.fill('From section ' + label)
      await field.blur() // The submit control must work independently of input focus.
      await expect(page.locator('[data-sheet-send]')).toBeVisible()
      await screenshot('section-sheet')
      await page.addScriptTag({ path: fileURLToPath(new URL('../web/node_modules/axe-core/axe.min.js', import.meta.url)) })
      const violations = await page.evaluate(async () => (await window.axe.run(document)).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => v.id))
      expect(violations).toEqual([])
      await page.locator('[data-sheet-send]').click()
      await expect.poll(() => saved('From section ' + label), { timeout: 15000 }).toMatchObject({ project_id: project.id, section_id: section.id })
      await page.keyboard.press('Escape')
      await expect(field).toHaveCount(0)
    } else {
      await expect(page.locator('textarea[aria-label="Add a task to Doing"]')).toBeVisible()
      await screenshot('inline-section')
      await page.keyboard.press('Escape')
    }

    await chooseLayout(page, 'Board')
    await expect(page.locator('[data-column]').first()).toBeVisible()
    await screenshot('board')
    await trigger.click()
    if (!baseline && width < 768) {
      await expect(field).toBeVisible()
      await field.fill('From board ' + label)
      await page.locator('[data-sheet-send]').click()
      await expect.poll(() => saved('From board ' + label), { timeout: 15000 }).toMatchObject({ project_id: project.id, section_id: section.id })
      await page.keyboard.press('Escape')
      await expect(field).toHaveCount(0)
      await page.locator('[data-column-add=""]').click()
      await expect(field).toBeVisible()
      await expect(page.locator('[data-quick-add-section]')).toContainText('No section')
      await screenshot('board-sheet')
      await field.fill('Offline ' + label)
      await context.setOffline(true)
      await page.locator('[data-sheet-send]').click()
      await expect(page.locator('[data-sheet-added]')).toContainText('Added')
      await expect(field).toHaveValue('')
      await context.setOffline(false)
      await expect.poll(() => saved('Offline ' + label), { timeout: 15000 }).toMatchObject({ project_id: project.id, section_id: null })
    } else {
      await expect(page.locator('textarea[aria-label="Add a task to Doing"]')).toBeVisible()
      await screenshot('board-inline')
    }
    expect(errors).toEqual([])
    console.log('OK', label)
    await context.close()
  }
  await api.close()
  console.log('PHONE TASK ADD OK; temporary server:', base)
} finally {
  await browser?.close()
  if (server.exitCode === null) {
    server.kill('SIGTERM')
    await new Promise((resolve) => server.once('exit', resolve))
  }
  rmSync(dir, { recursive: true, force: true })
}
