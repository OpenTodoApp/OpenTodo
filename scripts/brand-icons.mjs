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
  // The deploy templates' logos and their upstream copies (deploy/README.md): the colour
  // mark named "OpenTodo", the 512 px icon, and 256 px icons for CasaOS and Cosmos.
  ...[
    'deploy/coolify/opentodo.svg', 'deploy/coolify/upstream/public/svgs/opentodo.svg', 'deploy/coolify/upstream/coolify-docs/public/images/services/opentodo-logo.svg',
    'deploy/dokploy/blueprints/opentodo/opentodo.svg', 'deploy/dokploy/upstream/blueprints/opentodo/opentodo.svg',
    'deploy/easypanel/assets/logo.svg', 'deploy/easypanel/upstream/templates/opentodo/assets/logo.svg',
    'deploy/casaos/upstream/Apps/OpenTodo/icon.svg',
  ].map((path) => ({ path, svg: true, title: true })),
  { path: 'deploy/caprover/upstream/public/v4/logos/opentodo.png', size: 512 },
  { path: 'deploy/casaos/upstream/Apps/OpenTodo/icon.png', size: 256 },
  { path: 'deploy/cosmos/upstream/servapps/OpenTodo/icon.png', size: 256 },
]

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

/** The licence note every standalone brand file carries. */
export const NOTICE = '<!-- OpenTodo brand mark. Part of OpenTodo, AGPL-3.0 (see LICENSE). -->'

/**
 * One symbol of the source (`mono` or `colour`) as a standalone SVG document; `full`
 * drops the colour square's rounding, `title` names the image (for catalogs that show
 * the file on its own).
 */
export function symbolSvg(source, id, { full = false, size, title = false } = {}) {
  const m = new RegExp(`<symbol id="${id}" viewBox="([^"]+)">([\\s\\S]*?)</symbol>`).exec(source)
  if (!m) throw new Error(`${SOURCE} has no symbol "${id}"`)
  const body = full ? m[2].replace(/ rx="[^"]*"/, '') : m[2]
  const dims = size ? ` width="${size}" height="${size}"` : ''
  const named = title ? ' role="img"' : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${m[1]}"${dims}${named}>${title ? '<title>OpenTodo</title>' : ''}${NOTICE}${body}</svg>\n`
}

/** The colour symbol as a standalone SVG document: the favicon, and the page each raster is rendered from. */
export const colourSvg = (source, opts) => symbolSvg(source, 'colour', opts)

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
        bytes = Buffer.from(colourSvg(source, { title: out.title }))
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
