// The brand rasters are current (OpenSpec change sidebar-v2, design D3): every
// output matches the stamp written by scripts/brand-icons.mjs, and the stamp was
// written from today's brand.svg. Runs without a browser.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync, inflateSync } from 'node:zlib'
import { OUTPUTS, ROOT, SOURCE, STAMP, androidXml, colourSvg, pngToRgb, sha256, symbolGroup, symbolPaths } from './brand-icons.mjs'

const read = (p) => readFileSync(join(ROOT, p))
const stamp = JSON.parse(read(STAMP))
const regenerate = 'run `node scripts/brand-icons.mjs` and commit the files'

test('the stamp was written from the current brand.svg', () => {
  assert.equal(stamp.source, sha256(read(SOURCE)), `${SOURCE} changed: ${regenerate}`)
})

test('the stamp was written from the current wordmark.svg', () => {
  assert.equal(stamp.wordmark, sha256(read('web/src/ui/icons/wordmark.svg')), `the wordmark changed: ${regenerate}`)
})

test('every output exists and matches the stamp', () => {
  assert.deepEqual(Object.keys(stamp.outputs).sort(), OUTPUTS.map((o) => o.path).sort())
  for (const { path } of OUTPUTS) {
    assert.ok(existsSync(join(ROOT, path)), `${path} is missing: ${regenerate}`)
    assert.equal(sha256(read(path)), stamp.outputs[path], `${path} differs from its render: ${regenerate}`)
  }
})

test('the favicon is the colour symbol itself', () => {
  assert.equal(read('web/public/favicon.svg').toString(), colourSvg(read(SOURCE).toString()))
})

test('the maskable icon fills its square', () => {
  const svg = colourSvg(read(SOURCE).toString(), { full: true })
  assert.doesNotMatch(svg, / rx="/)
  assert.match(colourSvg(read(SOURCE).toString()), / rx="14"/)
})

test('PNG outputs have the declared pixel size', () => {
  for (const { path, size } of OUTPUTS.filter((o) => o.size)) {
    const png = read(path)
    assert.equal(png.toString('latin1', 1, 4), 'PNG', path)
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [size, size], path)
  }
})

// The native shells' icons (OpenSpec change brand-mark-tray, design D3 and D4).
const IOS_ICON = 'mobile/ios/OpenTodo/Assets.xcassets/AppIcon.appiconset/AppIcon.png'

/** The first pixel of an 8-bit PNG: on the first row every filter leaves it as stored. */
function firstPixel(png) {
  const idat = []
  for (let at = 8; at < png.length; ) {
    const len = png.readUInt32BE(at)
    if (png.toString('latin1', at + 4, at + 8) === 'IDAT') idat.push(png.subarray(at + 8, at + 8 + len))
    at += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  return [...raw.subarray(1, 4)]
}

test('the iOS app icon is the opaque colour mark at 1024 px', () => {
  const out = OUTPUTS.find((o) => o.path === IOS_ICON)
  assert.ok(out, `${IOS_ICON} is not a brand output`)
  assert.equal(out.size, 1024)
  const png = read(IOS_ICON)
  assert.equal(png[24], 8, 'bit depth')
  assert.equal(png[25], 2, 'colour type 2: RGB without alpha, as the App Store requires')
  assert.deepEqual(firstPixel(png), [0x0f, 0x17, 0x2a], 'the corner is the slate square')
})

test('the Android icons are written from the brand source', () => {
  const source = read(SOURCE).toString()
  const [tray, tick] = symbolPaths(source, 'mono')
  const android = OUTPUTS.filter((o) => o.android)
  assert.deepEqual(android.map((o) => o.android).sort(), ['background', 'foreground', 'launcher', 'monochrome', 'notification'])
  for (const { path, android: kind } of android) {
    const xml = read(path).toString()
    assert.equal(xml, androidXml(source, kind), `${path} differs from its render: ${regenerate}`)
    if (kind !== 'launcher' && kind !== 'background') {
      assert.ok(xml.includes(`android:pathData="${tray}"`) && xml.includes(`android:pathData="${tick}"`), `${path} draws the tray and the tick`)
    }
  }
  const launcher = read(android.find((o) => o.android === 'launcher').path).toString()
  for (const layer of ['background', 'foreground', 'monochrome']) assert.match(launcher, new RegExp(`<${layer} android:drawable="@drawable/ic_launcher_${layer}"`))
  assert.match(launcher, /^<\?xml[^>]*\?>\s*<adaptive-icon /)
  const notification = read(android.find((o) => o.android === 'notification').path).toString()
  assert.doesNotMatch(notification, /fillColor/)
  assert.deepEqual([...new Set(notification.match(/strokeColor="[^"]+"/g))], ['strokeColor="#FFFFFFFF"'])
})

/** An 8-bit RGBA PNG of `width` × `height` from already filtered rows (each led by its filter byte). */
function rgbaPng(width, height, rows) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from(rows.flat()))), chunk('IEND', Buffer.alloc(0))])
}

test('an RGBA screenshot is re-encoded as RGB with the same pixels', () => {
  // A 2 × 4 RGBA image whose rows use the Sub, Up, Average and Paeth filters.
  const px = [[[10, 20, 30, 255], [200, 100, 50, 255]], [[15, 25, 35, 255], [210, 90, 60, 255]], [[40, 80, 120, 255], [5, 6, 7, 255]], [[90, 3, 250, 255], [33, 180, 2, 128]]]
  const sub = (a, b) => (a - b + 256) & 0xff
  // The Paeth predictor as the PNG specification defines it.
  const paeth = (a, b, c) => {
    const p = a + b - c
    const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)]
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
  }
  const rows = [
    [1, ...px[0][0], ...px[0][1].map((v, i) => sub(v, px[0][0][i]))],
    [2, ...px[1][0].map((v, i) => sub(v, px[0][0][i])), ...px[1][1].map((v, i) => sub(v, px[0][1][i]))],
    [3, ...px[2][0].map((v, i) => sub(v, px[1][0][i] >> 1)), ...px[2][1].map((v, i) => sub(v, (px[2][0][i] + px[1][1][i]) >> 1))],
    [4, ...px[3][0].map((v, i) => sub(v, paeth(0, px[2][0][i], 0))), ...px[3][1].map((v, i) => sub(v, paeth(px[3][0][i], px[2][1][i], px[2][0][i])))],
  ]
  const rgb = pngToRgb(rgbaPng(2, 4, rows))
  assert.equal(rgb[25], 2)
  const idat = []
  for (let at = 8; at < rgb.length; ) {
    const len = rgb.readUInt32BE(at)
    if (rgb.toString('latin1', at + 4, at + 8) === 'IDAT') idat.push(rgb.subarray(at + 8, at + 8 + len))
    at += 12 + len
  }
  const expected = px.map((row) => [0, ...row.flatMap((p) => p.slice(0, 3))]).flat()
  assert.deepEqual([...inflateSync(Buffer.concat(idat))], expected)
})

test('a PNG row with an unknown filter is refused, not zeroed', () => {
  assert.throws(() => pngToRgb(rgbaPng(1, 1, [[7, 1, 2, 3, 255]])), /row 0 has unknown filter 7/)
})

// The brand kit (OpenSpec change brand-kit).
const WORDMARK = 'web/src/ui/icons/wordmark.svg'

test('the wordmark source is "OpenTodo" as one outlined path', () => {
  assert.ok(existsSync(join(ROOT, WORDMARK)), `${WORDMARK} is missing`)
  const svg = read(WORDMARK).toString()
  assert.match(svg, /viewBox="0 0 123 24"/)
  assert.equal((svg.match(/<path /g) ?? []).length, 1)
  assert.doesNotMatch(svg, /<text/)
  assert.match(svg, /AGPL-3\.0/)
  assert.match(svg, /SIL Open Font License/)
})

const KIT = [
  'brand/README.md',
  ...['mark-on-light', 'mark-on-dark', 'mark-black', 'mark-white', 'mark-colour', 'mark-colour-square', 'lockup-on-light', 'lockup-on-dark'].map((n) => `brand/svg/${n}.svg`),
  ...[16, 32, 48, 64, 128, 180, 192, 256, 512, 1024].map((s) => `brand/png/icon-${s}.png`),
  ...['on-light', 'on-dark', 'black', 'white'].flatMap((v) => [256, 512, 1024].map((s) => `brand/png/mark-${v}-${s}.png`)),
  ...['on-light', 'on-dark'].flatMap((v) => [`brand/png/lockup-${v}-852x192.png`, `brand/png/lockup-${v}-1704x384.png`]),
  'brand/png/avatar-512.png',
  'brand/png/github-social-preview-1280x640.png',
  'brand/png/og-default-1200x630.png',
]

test('the brand kit is generated, and brand/ holds nothing else', () => {
  const outputs = OUTPUTS.map((o) => o.path)
  for (const path of KIT) assert.ok(outputs.includes(path), `${path} is not a brand output`)
  const onDisk = []
  const walk = (dir) => {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`
      if (e.name.startsWith('.')) continue // .DS_Store and other files git ignores
      if (e.isDirectory()) walk(rel)
      else onDisk.push(rel)
    }
  }
  walk('brand')
  assert.deepEqual(onDisk.sort(), outputs.filter((p) => p.startsWith('brand/')).sort(), `brand/ holds only generated files: ${regenerate}`)
})

test('the lockups draw the mark, with its stroke, and the outlined wordmark, not text', () => {
  const source = read(SOURCE).toString()
  const [tray, tick] = symbolPaths(source, 'mono')
  const word = /<path d="([^"]+)"/.exec(read(WORDMARK).toString())[1]
  for (const v of ['on-light', 'on-dark']) {
    const svg = read(`brand/svg/lockup-${v}.svg`).toString()
    for (const d of [tray, tick, word]) assert.ok(svg.includes(`d="${d}"`), `lockup-${v} draws ${d.slice(0, 20)}…`)
    assert.ok(svg.includes(`<g ${symbolGroup(source, 'mono')}>`), `lockup-${v} uses the mono symbol's stroke`)
    assert.doesNotMatch(svg, /<text/)
  }
})

test('kit PNGs are named after their pixel size', () => {
  for (const path of KIT.filter((p) => p.endsWith('.png'))) {
    const png = read(path)
    const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)]
    const named = /-(\d+)x(\d+)\.png$/.exec(path) ?? /-(\d+)\.png$/.exec(path)
    assert.deepEqual([w, h], [Number(named[1]), Number(named[2] ?? named[1])], path)
  }
})
