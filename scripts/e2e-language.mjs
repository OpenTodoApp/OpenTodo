// End-to-end check of precache-device-language against a running server with a FRESH
// data directory: a browser set to German installs the app, the service worker stores
// the German interface catalogue and no other, and an offline reload shows German.
// See scripts/README.md.
import { untilOfflineReady } from './e2e-sw.mjs'
const { chromium } = await import('playwright').catch(async () => {
  const { createRequire } = await import('node:module')
  const { execSync } = await import('node:child_process')
  return createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')
})

const base = process.env.OPENTODO_URL ?? 'http://127.0.0.1:8080'
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'de-DE' })
const page = await ctx.newPage()
const step = (s) => console.log('·', s)

step('owner account, browser in German')
const reg = await ctx.request.post(`${base}/api/v1/auth/register`, { data: { email: 'ada@example.com', name: 'Ada', password: 'correct horse battery staple' } })
if (!reg.ok()) throw new Error(`register: ${reg.status()} ${await reg.text()}`)

step('first visit: the worker installs, then stores the language it is shown in')
await page.goto(base)
await page.waitForFunction(() => document.documentElement.lang === 'de', null, { timeout: 30_000 })
await untilOfflineReady(page)
/** The app's cached catalogue files, by language. */
const stored = () => page.evaluate(async () => {
  const out = new Set()
  for (const name of await caches.keys()) {
    for (const req of await (await caches.open(name)).keys()) {
      const m = /\/assets\/lang-([a-z]{2,3}(?:-[A-Za-z]+)?)-/.exec(new URL(req.url).pathname)
      if (m) out.add(m[1])
    }
  }
  return [...out].sort()
})
let langs = []
for (let i = 0; i < 100 && !langs.includes('de'); i++) { langs = await stored(); if (!langs.includes('de')) await page.waitForTimeout(200) }
if (JSON.stringify(langs) !== '["de"]') throw new Error(`stored catalogues: ${JSON.stringify(langs)}, want only de`)

step('offline reload: still German')
await ctx.setOffline(true)
await page.reload()
await page.waitForFunction(() => document.documentElement.lang === 'de', null, { timeout: 30_000 })
await ctx.setOffline(false)

await browser.close()
console.log('e2e-language: ok')
