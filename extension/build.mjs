// Builds the two store packages from one source manifest (OpenSpec change
// extension-v2, design D7): dist/extension-chrome/ and dist/extension-firefox/,
// zipped as dist/opentodo-browser-extension-chrome.zip and -firefox.zip. No
// dependencies: Node's zlib writes the zips.
//
//   node extension/build.mjs          build both packages (run by `make extension`)
//   node extension/build.mjs --dev    also write extension/manifest.json (Chrome form)
//                                     to load the source folder unpacked
//
// It refuses a manifest that declares host permissions or content scripts (only
// the optional http(s) access asked for the server's origin) and a version that
// is not the first entry of extension/CHANGELOG.md.
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateRawSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

/** The files a package ships besides its manifest. */
export const FILES = [
  'background.js', 'capture.js', 'share-url.js', 'settings.js', 'api.js', 'mail.js',
  'popup.html', 'popup.css', 'popup.js', 'popup-state.js', 'options.html', 'options.js',
  'icons/icon-16.png', 'icons/icon-48.png', 'icons/icon-128.png', '_locales',
]

/** Problems with the source manifest (empty when it may ship). */
export function manifestProblems(m) {
  const out = []
  const opt = JSON.stringify(m.optional_host_permissions ?? [])
  if (m.host_permissions) out.push('the manifest must not declare host_permissions')
  if (m.content_scripts) out.push('the manifest must not declare content_scripts')
  if (opt !== '[]' && opt !== JSON.stringify(['https://*/*', 'http://*/*'])) out.push('optional_host_permissions may only be the http(s) access asked for the server origin')
  if (m.action?.default_popup !== 'popup.html') out.push('the toolbar button must open popup.html')
  return out
}

/** The first version entry ("## 0.6.0 …") of the extension's changelog. */
export function changelogVersion(text) {
  return text.match(/^## \[?v?(\d+\.\d+\.\d+)/m)?.[1] ?? ''
}

/** The manifest for one browser: Chrome runs a service worker, Firefox an event page. */
export function manifestFor(m, browser) {
  const out = structuredClone(m)
  if (browser === 'chrome') {
    delete out.background.scripts
    delete out.browser_specific_settings
  } else {
    delete out.background.service_worker
  }
  return out
}

function files(dir, rel) {
  const p = join(dir, rel)
  if (!statSync(p).isDirectory()) return [rel]
  return readdirSync(p).sort().flatMap((n) => files(dir, join(rel, n)))
}

/** A zip archive of `entries` ({name, data}), deflated, with fixed timestamps so builds repeat. */
export function zip(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  // 1980-01-01 00:00, the DOS epoch: the same bytes for the same files.
  const time = 0, date = (0 << 9) | (1 << 5) | 1
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name.replaceAll('\\', '/'))
    const packed = deflateRawSync(data, { level: 9 })
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // UTF-8 names
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    locals.push(local, nameBuf, packed)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(packed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBuf)
    offset += local.length + nameBuf.length + packed.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

/** Build both packages into `out`; returns the zip paths. Throws on a problem. */
export function build({ src = here, out = join(root, 'dist'), dev = false } = {}) {
  const m = JSON.parse(readFileSync(join(src, 'manifest.src.json'), 'utf8'))
  const problems = manifestProblems(m)
  if (problems.length) throw new Error(problems.join('; '))
  const logged = changelogVersion(readFileSync(join(src, 'CHANGELOG.md'), 'utf8'))
  if (logged !== m.version) throw new Error(`manifest version ${m.version} is not the first entry of extension/CHANGELOG.md (it starts with ${logged || 'no version'})`)
  const zips = []
  for (const browser of ['chrome', 'firefox']) {
    const dir = join(out, `extension-${browser}`)
    rmSync(dir, { recursive: true, force: true })
    const manifest = Buffer.from(JSON.stringify(manifestFor(m, browser), null, 2) + '\n')
    const entries = [{ name: 'manifest.json', data: manifest }]
    for (const f of FILES.flatMap((f) => files(src, f))) entries.push({ name: f, data: readFileSync(join(src, f)) })
    for (const e of entries) {
      mkdirSync(dirname(join(dir, e.name)), { recursive: true })
      writeFileSync(join(dir, e.name), e.data)
    }
    const z = join(out, `opentodo-browser-extension-${browser}.zip`)
    writeFileSync(z, zip(entries))
    zips.push(z)
  }
  if (dev) writeFileSync(join(src, 'manifest.json'), JSON.stringify(manifestFor(m, 'chrome'), null, 2) + '\n')
  return zips
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    for (const z of build({ dev: process.argv.includes('--dev') })) console.log(`  ${relative(root, z)} (${statSync(z).size} bytes)`)
  } catch (err) {
    console.error(`extension: ${err.message}`)
    process.exit(1)
  }
}

