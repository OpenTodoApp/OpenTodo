// Writes the web app's file list, app-manifest.json, into the build (OpenSpec
// change signed-web-app, design D1 and D11). `npm run build` runs it after
// `vite build`, once vite-plugin-pwa has written sw.js, whose hash the list
// needs. The list is unsigned: `go run ./cmd/websign sign` signs it (make web
// with WEB_SIGNING_KEY, the Dockerfile with the web_signing_key secret, and the
// release's web-sign job).
//
//   OPENTODO_VERSION  the version (a release tag, with or without "v"); 0.0.0-dev without it
//   OPENTODO_BUILD    "preview" for the image built from main
//   WEB_SIGNING_KEY   an own key: its public half becomes the build's only key
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildKeys, repoRoot } from './signingKeys.mjs'

export const MANIFEST = 'app-manifest.json'
/** Not listed: the list itself, and the web app manifest, which a branded server rewrites (D7). */
const UNLISTED = new Set([MANIFEST, 'manifest.webmanifest'])
const WORKER = 'sw.js'

/**
 * Whether the worker downloads a file before switching versions ("install")
 * or checks it when first used ("lazy"): the precache rule of vite.config.ts.
 * The map and the task page are lazy, as they were never precached.
 */
export function loadOf(file) {
  if (file === WORKER || file === 't.html') return 'lazy'
  if (!/\.(js|css|html|svg|png|woff2|md)$/.test(file)) return 'lazy'
  if (/(^|\/)(MapView-|maplibre-gl-worker-)/.test(file) || file.startsWith('assets/t-')) return 'lazy'
  return 'install'
}

function walk(dir, base = '') {
  const out = []
  for (const name of readdirSync(path.join(dir, base))) {
    if (name.startsWith('.')) continue
    const rel = base ? `${base}/${name}` : name
    if (statSync(path.join(dir, rel)).isDirectory()) out.push(...walk(dir, rel))
    else if (!UNLISTED.has(rel)) out.push(rel)
  }
  return out
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

/** The unsigned envelope for the built web app in dist. */
export function buildManifest(dist, { version = '0.0.0-dev', build, keys = [], refuse = false } = {}) {
  const files = {}
  for (const rel of walk(dist).sort()) {
    const body = readFileSync(path.join(dist, rel))
    files[rel] = { sha256: sha256(body), size: body.length, load: loadOf(rel) }
  }
  if (!files[WORKER]) throw new Error(`app-manifest: ${WORKER} is missing from ${dist}`)
  const payload = {
    app: 'opentodo-web',
    version: version.replace(/^v/, ''),
    ...(build ? { build } : {}),
    refuse,
    keys,
    worker: { path: WORKER, sha256: files[WORKER].sha256 },
    files,
  }
  return {
    format: 1,
    payload: Buffer.from(JSON.stringify(payload)).toString('base64url'),
    signatures: [],
  }
}

/** Writes dist/app-manifest.json from the environment. */
export function writeManifest(dist, env = process.env) {
  const { keys, refuse } = buildKeys(env)
  const envelope = buildManifest(dist, {
    version: env.OPENTODO_VERSION || '0.0.0-dev',
    build: env.OPENTODO_BUILD === 'preview' ? 'preview' : undefined,
    keys,
    refuse,
  })
  writeFileSync(path.join(dist, MANIFEST), JSON.stringify(envelope, null, 2) + '\n')
  return envelope
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = path.join(repoRoot, 'internal/web/dist')
  const env = writeManifest(dist)
  const files = Object.keys(JSON.parse(Buffer.from(env.payload, 'base64url').toString()).files).length
  console.log(`app-manifest: ${files} files listed in internal/web/dist/${MANIFEST} (unsigned)`)
}
