// The keys a web build trusts (OpenSpec change signed-web-app, design D3 and
// D11): the official keys in internal/websign/release-keys.json, or, when
// WEB_SIGNING_KEY names a private key (a file's path or its PEM text), that
// key's public half alone. vite.config.ts builds them into the service worker;
// scripts/app-manifest.mjs writes them into the list. The private key is only
// read here to derive its public half; it is never written anywhere.
import { createPrivateKey, createPublicKey } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** internal/websign/release-keys.json: { refuse, keys: [{ spki, role }] }. */
export function officialKeys(root = repoRoot) {
  const file = JSON.parse(readFileSync(path.join(root, 'internal/websign/release-keys.json'), 'utf8'))
  return { refuse: file.refuse === true, keys: Array.isArray(file.keys) ? file.keys : [] }
}

function readPem(value, root) {
  if (value.trim().startsWith('-----BEGIN')) return value
  for (const candidate of [path.resolve(value), path.resolve(root, value), path.resolve(root, 'web', value)]) {
    if (existsSync(candidate)) return readFileSync(candidate, 'utf8')
  }
  throw new Error(`WEB_SIGNING_KEY: no key file at ${value}`)
}

/** The public half of a PEM private key, as base64 DER SubjectPublicKeyInfo. */
export function publicSpki(pem) {
  return createPublicKey(createPrivateKey(pem)).export({ type: 'spki', format: 'der' }).toString('base64')
}

/**
 * The build's key set and switch. keys: the keys the list names and the worker
 * trusts on first use; official: the official keys, for "Signed by OpenTodo".
 */
export function buildKeys(env = process.env, root = repoRoot) {
  const official = officialKeys(root)
  const own = env.WEB_SIGNING_KEY
  const keys = own ? [{ spki: publicSpki(readPem(own, root)), role: 'release' }] : official.keys
  return { keys, refuse: official.refuse, official: official.keys.map((k) => k.spki) }
}
