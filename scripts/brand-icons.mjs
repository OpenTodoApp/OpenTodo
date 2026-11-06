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
import { deflateSync, inflateSync } from 'node:zlib'
import { FONT, KIT_OUTPUTS, WORDMARK, bannerPage } from './brand-kit.mjs'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const SOURCE = 'web/src/ui/icons/brand.svg'
export const STAMP = 'web/src/ui/icons/brand-icons.json'

/**
 * Every generated file: `full` fills the square edge to edge (maskable and
 * Apple icons, which the platform crops to its own shape); the others keep
 * the rounded square with transparent corners. `opaque` drops the alpha channel,
 * `jpeg` writes a JPEG (for a store that asks for one).
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
  // The other stores' icons (brand-assets-everywhere): Runtipi's 512 px JPEG logo, the Home
  // Assistant add-on's 128 px icon and its 250 × 100 logo (the lockup on the slate square), and
  // the Claude plugin's 192 px icon.
  ...['deploy/runtipi/metadata/logo.jpg', 'deploy/runtipi/upstream/apps/opentodo/metadata/logo.jpg'].map((path) => ({ path, size: 512, full: true, jpeg: true })),
  { path: 'deploy/homeassistant/upstream/opentodo/icon.png', size: 128 },
  { path: 'deploy/homeassistant/upstream/opentodo/logo.png', width: 250, height: 100, page: (s, w, h) => bannerPage(250, 100, s, w, h) },
  { path: 'deploy/claude-plugin/upstream/plugins/opentodo/.claude-plugin/icon.png', size: 192 },
  // The native shells (brand-mark-tray D3, D4): the iOS app icon, opaque as the App Store
  // requires, and the Android adaptive launcher icon and notification icon as vector drawables.
  { path: 'mobile/ios/OpenTodo/Assets.xcassets/AppIcon.appiconset/AppIcon.png', size: 1024, full: true, opaque: true },
  ...['launcher', 'background', 'foreground', 'monochrome', 'notification'].map((android) => ({
    path: `mobile/android/app/src/main/res/drawable/${android === 'notification' ? 'ic_notification' : android === 'launcher' ? 'ic_launcher' : `ic_launcher_${android}`}.xml`,
    android,
  })),
  // The brand kit in brand/ (brand-kit): the logo files for use outside the code.
  ...KIT_OUTPUTS,
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
  const symbol = symbolBody(source, id)
  const body = full ? symbol.body.replace(/ rx="[^"]*"/, '') : symbol.body
  const dims = size ? ` width="${size}" height="${size}"` : ''
  const named = title ? ' role="img"' : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${symbol.viewBox}"${dims}${named}>${title ? '<title>OpenTodo</title>' : ''}${NOTICE}${body}</svg>\n`
}

/** The `d` and `stroke` of each path in one symbol, in source order: the tray, then the tick. */
export function symbolStrokes(source, id) {
  const { body } = symbolBody(source, id)
  return [...body.matchAll(/<path d="([^"]+)"([^>]*)>/g)].map(([, d, rest]) => ({ d, stroke: /stroke="(#[0-9a-f]{6})"/i.exec(rest)?.[1] }))
}

/** The stroke attributes of one symbol's group (width, caps, joins), as written in the source. */
export function symbolGroup(source, id) {
  const g = /<g ([^>]*)>/.exec(symbolBody(source, id).body)
  if (!g) throw new Error(`${SOURCE}: symbol "${id}" has no group`)
  return g[1]
}

/** The path data of one symbol: the tray, then the tick. */
export const symbolPaths = (source, id) => symbolStrokes(source, id).map((p) => p.d)

function symbolBody(source, id) {
  const m = new RegExp(`<symbol id="${id}" viewBox="([^"]+)">([\\s\\S]*?)</symbol>`).exec(source)
  if (!m) throw new Error(`${SOURCE} has no symbol "${id}"`)
  return { viewBox: m[1], body: m[2] }
}

const ANDROID_NS = 'xmlns:android="http://schemas.android.com/apk/res/android"'
const argb = (hex) => `#FF${hex.slice(1).toUpperCase()}`
const strokePath = (d, color, width) =>
  `<path android:pathData="${d}" android:strokeColor="${color}" android:strokeWidth="${width}" android:strokeLineCap="round" android:strokeLineJoin="round" />`

/**
 * One Android drawable of the mark (D4). The 24-unit drawing is scaled into the 66 dp safe
 * zone of the 108 dp adaptive canvas; the notification icon is the mark as a white silhouette.
 */
export function androidXml(source, kind) {
  const head = '<?xml version="1.0" encoding="utf-8"?>\n'
  if (kind === 'launcher') {
    return `${head}<adaptive-icon ${ANDROID_NS}>\n    ${NOTICE}\n` +
      ['background', 'foreground', 'monochrome'].map((l) => `    <${l} android:drawable="@drawable/ic_launcher_${l}" />\n`).join('') + '</adaptive-icon>\n'
  }
  const vector = (dp, viewport, inner) =>
    `${head}<vector ${ANDROID_NS}\n    android:width="${dp}dp" android:height="${dp}dp" android:viewportWidth="${viewport}" android:viewportHeight="${viewport}">\n    ${NOTICE}\n${inner}</vector>\n`
  if (kind === 'background') {
    const slate = /<rect [^>]*fill="(#[0-9a-f]{6})"/i.exec(symbolBody(source, 'colour').body)[1]
    return vector(108, 108, `    <path android:fillColor="${argb(slate)}" android:pathData="M0,0h108v108h-108z" />\n`)
  }
  const colour = symbolStrokes(source, 'colour')
  if (kind === 'notification') return vector(24, 24, colour.map((p) => `    ${strokePath(p.d, '#FFFFFFFF', 2)}\n`).join(''))
  const width = /stroke-width="([^"]+)"/.exec(symbolBody(source, 'colour').body)[1]
  const paths = colour.map((p) => `        ${strokePath(p.d, kind === 'monochrome' ? '#FFFFFFFF' : argb(p.stroke), width)}\n`).join('')
  if (kind !== 'foreground' && kind !== 'monochrome') throw new Error(`unknown Android icon "${kind}"`)
  return vector(108, 108, `    <group android:translateX="21" android:translateY="21" android:scaleX="2.75" android:scaleY="2.75">\n${paths}    </group>\n`)
}

/** A PNG's chunks as [type, data] pairs. */
function chunks(png) {
  const out = []
  for (let at = 8; at < png.length; ) {
    const len = png.readUInt32BE(at)
    out.push([png.toString('latin1', at + 4, at + 8), png.subarray(at + 8, at + 8 + len)])
    at += 12 + len
  }
  return out
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, crc])
}

/**
 * An 8-bit RGBA PNG re-encoded as RGB (D3): the rows are unfiltered, the alpha byte of each
 * pixel is dropped, and the rows are written with filter 0. RGB input is returned unchanged.
 */
export function pngToRgb(png) {
  const parts = chunks(png)
  const ihdr = parts.find(([t]) => t === 'IHDR')[1]
  if (ihdr[9] === 2) return png
  if (ihdr[8] !== 8 || ihdr[9] !== 6 || ihdr[12] !== 0) throw new Error('expected an 8-bit, non-interlaced RGBA PNG')
  const width = ihdr.readUInt32BE(0)
  const height = ihdr.readUInt32BE(4)
  const raw = inflateSync(Buffer.concat(parts.filter(([t]) => t === 'IDAT').map(([, d]) => d)))
  const stride = width * 4
  const out = Buffer.alloc(height * (1 + width * 3))
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    if (filter > 4) throw new Error(`PNG row ${y} has unknown filter ${filter}`)
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)))
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? line[i - 4] : 0
      const b = prev[i]
      const c = i >= 4 ? prev[i - 4] : 0
      const p = a + b - c
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter]
      line[i] = (line[i] + pred) & 0xff
    }
    const row = y * (1 + width * 3)
    for (let x = 0; x < width; x++) line.copy(out, row + 1 + x * 3, x * 4, x * 4 + 3)
    prev = line
  }
  const head = Buffer.from(ihdr)
  head[9] = 2
  return Buffer.concat([png.subarray(0, 8), chunk('IHDR', head), chunk('IDAT', deflateSync(out, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
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
  const wordmark = readFileSync(join(ROOT, WORDMARK), 'utf8')
  const font = readFileSync(join(ROOT, FONT))
  const helpers = { symbolSvg, symbolPaths, symbolGroup }
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  const stamp = { source: sha256(source), wordmark: sha256(wordmark), outputs: {} }
  try {
    for (const out of OUTPUTS) {
      let bytes
      if (out.svg) {
        bytes = Buffer.from(colourSvg(source, { title: out.title }))
      } else if (out.android) {
        bytes = Buffer.from(androidXml(source, out.android))
      } else if (out.text) {
        bytes = Buffer.from(out.text(source, wordmark, helpers))
      } else if (out.page) {
        const page = await browser.newPage({ viewport: { width: out.width, height: out.height }, deviceScaleFactor: 1 })
        const markup = out.page(source, wordmark, helpers, font)
        await page.setContent(markup.startsWith('<!doctype') ? markup : `<!doctype html><body style="margin:0;background:transparent">${markup}</body>`)
        await page.evaluate(() => document.fonts.ready)
        bytes = await page.screenshot({ omitBackground: !out.opaque, clip: { x: 0, y: 0, width: out.width, height: out.height } })
        if (out.opaque) bytes = pngToRgb(bytes)
        await page.close()
      } else {
        const page = await browser.newPage({ viewport: { width: out.size, height: out.size }, deviceScaleFactor: 1 })
        await page.setContent(`<!doctype html><body style="margin:0;background:transparent">${colourSvg(source, { full: out.full, size: out.size })}</body>`)
        const clip = { x: 0, y: 0, width: out.size, height: out.size }
        bytes = await page.screenshot(out.jpeg ? { type: 'jpeg', quality: 92, clip } : { omitBackground: !out.opaque, clip })
        if (out.opaque) bytes = pngToRgb(bytes)
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
