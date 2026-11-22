// Gzip copies of the web app's files (OpenSpec change compressed-static-assets, D1):
// `npm run build` runs it last, after the signed list is written. For each script,
// style sheet, SVG or Markdown file under dist/assets of at least 1 KiB, it writes
// <file>.gz when that is at most 90 % of the file, so the server can send it with
// Content-Encoding: gzip and spend no CPU per request. The copies are never listed
// or precached: the browser decodes them back to the listed bytes.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { constants, gzipSync } from 'node:zlib'
import { repoRoot } from './signingKeys.mjs'

const TYPES = /\.(js|css|svg|md)$/
const MIN_BYTES = 1024
const MAX_RATIO = 0.9

/** Writes the copies under dist/assets; returns the files compressed and the bytes before and after. */
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
    files++; raw += body.length; packed += gz.length
  }
  return { files, raw, packed }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { files, raw, packed } = compressDist(path.join(repoRoot, 'internal/web/dist'))
  console.log(`compress-dist: ${files} files, ${(raw / 1e6).toFixed(2)} MB → ${(packed / 1e6).toFixed(2)} MB gzip`)
}
