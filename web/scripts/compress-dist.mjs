// The web app's compressed files (OpenSpec change compressed-static-assets, D1):
// `npm run build` runs it last, after the signed list is written from the files as
// built. Each script, style sheet, SVG or Markdown file under dist/assets of at
// least 1 KiB is replaced by <file>.gz when that is at most 90 % of it: the binary
// embeds one form only, the server sends it with Content-Encoding: gzip (and
// decodes it for the rare client without gzip), and the browser, websign and the
// signed list all see the bytes it decodes to.
import { readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { constants, gzipSync } from 'node:zlib'
import { repoRoot } from './signingKeys.mjs'

const TYPES = /\.(js|css|svg|md)$/
const MIN_BYTES = 1024
const MAX_RATIO = 0.9

/** Replaces files under dist/assets by their gzip form; returns the files compressed and the bytes before and after. */
export function compressDist(dist) {
  const dir = path.join(dist, 'assets')
  let files = 0, raw = 0, packed = 0
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name)
    if (!TYPES.test(name) || !statSync(file).isFile()) continue
    const body = readFileSync(file)
    if (body.length < MIN_BYTES) continue
    const gz = gzipSync(body, { level: constants.Z_BEST_COMPRESSION })
    if (gz.length > body.length * MAX_RATIO) continue
    writeFileSync(file + '.gz', gz)
    unlinkSync(file)
    files++; raw += body.length; packed += gz.length
  }
  return { files, raw, packed }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { files, raw, packed } = compressDist(path.join(repoRoot, 'internal/web/dist'))
  console.log(`compress-dist: ${files} files, ${(raw / 1e6).toFixed(2)} MB → ${(packed / 1e6).toFixed(2)} MB gzip`)
}
