// Motion gate (OpenSpec change motion-v2, design-system "Motion sequences in the
// workbench", design D9): opens every Foundations → Motion story from the static
// build in Chromium and plays it twice. With reduced motion emulated, any running
// animation whose keyframes change position, scale or size fails; with
// `data-motion="none"` on the root, any running animation at all fails. Each failure
// names the story, the mode and the property.
//
//   cd web && npm run build-storybook && node ../scripts/ui-check/motion.mjs
//
// Env: STORYBOOK_DIR (default web/storybook-static), ONLY (comma-separated story ids),
// DEBUG (print what each run sampled).
import { fileURLToPath } from 'node:url'
import { loadPlaywright, serveStatic, storyIds } from './serve.mjs'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const root = process.env.STORYBOOK_DIR ?? `${repo}web/storybook-static`
const MOVEMENT = ['transform', 'translate', 'scale', 'rotate', 'height', 'block-size', 'width', 'inline-size', 'top', 'left', 'margin-block', 'padding-block']

const { chromium } = await loadPlaywright()
const server = await serveStatic(root)
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null
const ids = (await storyIds(root)).filter((id) => id.startsWith('foundations-motion--') && (!only || only.has(id)))
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const failures = []

/** Plays the story and samples the running animations for the length of a moment. */
async function sample(page) {
  return page.evaluate(async (movement) => {
    const seen = new Set()
    const read = () => {
      for (const a of document.getAnimations()) {
        if (a.playState !== 'running') continue
        const name = a.animationName ?? a.transitionProperty ?? a.constructor.name
        const props = new Set()
        for (const k of a.effect?.getKeyframes?.() ?? []) for (const p of Object.keys(k)) props.add(p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`))
        if (a.transitionProperty) props.add(a.transitionProperty)
        seen.add(JSON.stringify({ name, props: [...props].filter((p) => !['offset', 'easing', 'composite', 'computed-offset'].includes(p)), moves: [...props].filter((p) => movement.includes(p)) }))
      }
    }
    document.querySelector('[data-play]')?.click()
    // Every sequence ends within the moment (400 ms); sample a little beyond it.
    for (let t = 0; t < 30; t++) {
      read()
      await new Promise((r) => setTimeout(r, 16))
    }
    return [...seen].map((s) => JSON.parse(s))
  }, MOVEMENT)
}

async function check(id, mode) {
  const page = await browser.newPage({ viewport: { width: mode.width, height: 900 } })
  if (mode.reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${server.url}/iframe.html?id=${id}&viewMode=story&globals=theme:light`)
  await page.waitForFunction(() => document.querySelector('#storybook-root')?.childElementCount > 0, null, { timeout: 15000 })
  if (mode.none) await page.evaluate(() => { document.documentElement.dataset.motion = 'none' })
  const seen = await sample(page)
  if (process.env.DEBUG) console.log(id, JSON.stringify(mode), JSON.stringify(seen))
  for (const a of seen) {
    if (mode.none) failures.push(`${id} [no motion, ${mode.width} px]: ${a.name} runs (${a.props.join(', ') || 'no keyframes'})`)
    else if (a.moves.length) failures.push(`${id} [reduced motion, ${mode.width} px]: ${a.name} animates ${a.moves.join(', ')}`)
  }
  await page.close()
}

for (const id of ids) {
  // The phone sheet and the dialog differ below and above 640 px.
  for (const width of [375, 1280]) {
    await check(id, { reduced: true, width })
    await check(id, { none: true, width })
  }
}
failures.sort()

await browser.close()
server.close()
if (ids.length === 0) {
  console.error('UI motion check: no Foundations/Motion stories found')
  process.exit(1)
}
if (failures.length) {
  console.error(`UI motion check: ${failures.length} problem(s)\n${failures.map((f) => `  - ${f}`).join('\n')}`)
  process.exit(1)
}
console.log(`UI motion check: ${ids.length} stories × reduced motion and no motion × 2 widths, no movement survives`)
