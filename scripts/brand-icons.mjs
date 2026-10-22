// Renders every brand raster from the one source, web/src/ui/icons/brand.svg
// (OpenSpec change sidebar-v2, design D3), in the Chromium that Playwright
// already brings for `make docs-screenshots`, so there is no image dependency.
//
//   node scripts/brand-icons.mjs          writes the files below and the stamp
//
// The stamp (web/src/ui/icons/brand-icons.json) records the SHA-256 of the
// source and of every output; scripts/brand-icons.test.mjs compares them, so a
// changed source that was not regenerated, or an edited raster, fails without a
// browser. Environment: CHROMIUM_PATH (optional).
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const SOURCE = 'web/src/ui/icons/brand.svg'
export const STAMP = 'web/src/ui/icons/brand-icons.json'

/**
 * Every generated file: `full` fills the square edge to edge (maskable and
 * Apple icons, which the platform crops to its own shape); the others keep
 * the rounded square with transparent corners.
 */
export const OUTPUTS = [
  { path: 'web/public/favicon.svg', svg: true },
  { path: 'web/public/pwa-192.png', size: 192 },
  { path: 'web/public/pwa-512.png', size: 512 },
  { path: 'web/public/pwa-maskable-512.png', size: 512, full: true },
  { path: 'web/public/apple-touch-icon.png', size: 180, full: true },
  { path: 'extension/icons/icon-16.png', size: 16 },
  { path: 'extension/icons/icon-48.png', size: 48 },
  { path: 'extension/icons/icon-128.png', size: 128 },
]

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

/** The colour symbol of the source as a standalone SVG document. */
export function colourSvg(source, { full = false, size } = {}) {
  const m = /<symbol id="colour" viewBox="([^"]+)">([\s\S]*?)<\/symbol>/.exec(source)
  if (!m) throw new Error(`${SOURCE} has no symbol "colour"`)
  const body = full ? m[2].replace(/ rx="[^"]*"/, '') : m[2]
  const dims = size ? ` width="${size}" height="${size}"` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${m[1]}"${dims}>${body}</svg>\n`
}

async function main() {
  const { chromium } = await import('playwright').catch(async () => {
    const { createRequire } = await import('node:module')
    const { execSync } = await import('node:child_process')
    return createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')
  })
  const source = readFileSync(join(ROOT, SOURCE), 'utf8')
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  const stamp = { source: sha256(source), outputs: {} }
  try {
    for (const out of OUTPUTS) {
      let bytes
      if (out.svg) {
        bytes = Buffer.from(colourSvg(source))
      } else {
        const page = await browser.newPage({ viewport: { width: out.size, height: out.size }, deviceScaleFactor: 1 })
        await page.setContent(`<!doctype html><body style="margin:0;background:transparent">${colourSvg(source, { full: out.full, size: out.size })}</body>`)
        bytes = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: out.size, height: out.size } })
        await page.close()
      }
      mkdirSync(dirname(join(ROOT, out.path)), { recursive: true })
      writeFileSync(join(ROOT, out.path), bytes)
      stamp.outputs[out.path] = sha256(bytes)
      console.log(`wrote ${out.path}`)
    }
  } finally {
    await browser.close()
  }
  writeFileSync(join(ROOT, STAMP), JSON.stringify(stamp, null, 2) + '\n')
  console.log(`wrote ${STAMP}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
