// What a page shows when a wait fails (issue 1363): a screenshot, its address, the page's
// recent navigations, its errors, the requests still open, the document's state, its
// service worker and its text, into the report directory CI uploads on failure
// (layout-report, or E2E_REPORT); then the error goes on as before.
import { mkdirSync, writeFileSync } from 'node:fs'

export function diagnoser(report = process.env.E2E_REPORT ?? 'layout-report') {
  const navigations = new Map()
  const errors = new Map()
  const open = new Map()
  const stamp = () => new Date().toISOString()
  const watch = (p) => {
    navigations.set(p, [])
    errors.set(p, [])
    const requests = new Map()
    open.set(p, requests)
    p.on('framenavigated', (f) => { if (f === p.mainFrame()) navigations.get(p).push(`${stamp()} ${f.url()}`) })
    p.on('pageerror', (e) => errors.get(p).push(`${stamp()} ${e.message}`))
    p.on('console', (m) => { if (m.type() === 'error') errors.get(p).push(`${stamp()} console: ${m.text()}`) })
    p.on('request', (r) => requests.set(r, Date.now()))
    p.on('requestfinished', (r) => requests.delete(r))
    p.on('requestfailed', (r) => { requests.delete(r); errors.get(p).push(`${stamp()} request failed: ${r.url()} ${r.failure()?.errorText ?? ''}`) })
    return p
  }
  // The document's state and its service worker: a page that never drew the app
  // shows whether its scripts were in the document and who answered them.
  const pageState = (p) => Promise.race([p.evaluate(async () => {
    const sw = navigator.serviceWorker
    const regs = sw ? await Promise.race([sw.getRegistrations(), new Promise((r) => setTimeout(() => r(null), 2000))]) : null
    return {
      readyState: document.readyState,
      root: document.getElementById('root')?.childElementCount ?? null,
      scripts: [...document.scripts].map((s) => `${s.type || 'classic'} ${s.src || '(inline)'}`),
      controller: sw?.controller ? `${sw.controller.scriptURL} ${sw.controller.state}` : null,
      registrations: regs === null ? 'no answer in 2 s' : regs.map((g) => ({ active: g.active?.state ?? null, waiting: g.waiting?.state ?? null, installing: g.installing?.state ?? null })),
    }
  }), new Promise((r) => setTimeout(() => r({ unavailable: 'no answer in 5 s' }), 5000))]).catch((e) => ({ unavailable: String(e) }))
  const diagnosed = async (p, name, wait, extraErrors = []) => {
    try { return await wait() } catch (e) {
      try {
        mkdirSync(report, { recursive: true })
        await p.screenshot({ path: `${report}/e2e-${name}.png`, fullPage: true })
        const now = Date.now()
        const pending = [...(open.get(p) ?? new Map())].map(([r, at]) => `${now - at} ms ${r.method()} ${r.resourceType()} ${r.url()}`)
        const state = await pageState(p)
        const text = await p.evaluate(() => document.body.innerText).catch(() => '')
        writeFileSync(`${report}/e2e-${name}.txt`, [
          `url: ${p.url()}`, 'navigations:', ...(navigations.get(p) ?? []),
          'errors:', ...(errors.get(p) ?? []), ...extraErrors,
          'requests still open:', ...pending,
          'page:', JSON.stringify(state, null, 2),
          'text:', text.slice(0, 4000),
        ].join('\n'))
        console.log(`  ${name}: failed at ${p.url()}; screenshot and page text in ${report}/e2e-${name}.*`)
      } catch {}
      throw e
    }
  }
  return { watch, diagnosed }
}
