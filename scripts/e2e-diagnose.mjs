// What a page shows when a wait fails (issue 1363): a screenshot, its address, the page's
// recent navigations, its errors and its text, into the report directory CI uploads on
// failure (layout-report, or E2E_REPORT); then the error goes on as before.
import { mkdirSync, writeFileSync } from 'node:fs'

export function diagnoser(report = process.env.E2E_REPORT ?? 'layout-report') {
  const navigations = new Map()
  const errors = new Map()
  const watch = (p) => {
    navigations.set(p, [])
    errors.set(p, [])
    p.on('framenavigated', (f) => { if (f === p.mainFrame()) navigations.get(p).push(`${new Date().toISOString()} ${f.url()}`) })
    p.on('pageerror', (e) => errors.get(p).push(`${new Date().toISOString()} ${e.message}`))
    p.on('console', (m) => { if (m.type() === 'error') errors.get(p).push(`${new Date().toISOString()} console: ${m.text()}`) })
    return p
  }
  const diagnosed = async (p, name, wait, extraErrors = []) => {
    try { return await wait() } catch (e) {
      try {
        mkdirSync(report, { recursive: true })
        await p.screenshot({ path: `${report}/e2e-${name}.png`, fullPage: true })
        const text = await p.evaluate(() => document.body.innerText).catch(() => '')
        writeFileSync(`${report}/e2e-${name}.txt`, [
          `url: ${p.url()}`, 'navigations:', ...(navigations.get(p) ?? []),
          'errors:', ...(errors.get(p) ?? []), ...extraErrors, 'text:', text.slice(0, 4000),
        ].join('\n'))
        console.log(`  ${name}: failed at ${p.url()}; screenshot and page text in ${report}/e2e-${name}.*`)
      } catch {}
      throw e
    }
  }
  return { watch, diagnosed }
}
