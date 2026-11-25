// The v1 surface freeze against the released snapshot (OpenSpec change
// stability-contract, design D1). internal/httpapi TestV1SurfaceIsAdditive
// compares the code with internal/httpapi/testdata/v1_surface.json; this
// compares that file with the one at the v1.0.0 tag, so an entry deleted from
// both the code and the file by hand is caught too.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

export const SURFACE_FILE = 'internal/httpapi/testdata/v1_surface.json'
export const FREEZE_TAG = 'v1.0.0'
const SEP = ' › '

/**
 * Changes to a tagged entry that a security fix made, one by one, each with the
 * exact value before and after (docs/stability.md: a security fix may refuse read or
 * agent tokens on a route that lists the account's credentials or connected apps).
 * Any other change to a tagged entry, or this one to another value, is still refused.
 */
export const SECURITY_NARROWINGS = {
  // credential-lists-full-tokens: listing the account's tokens needs a full token.
  'routes › GET /api/v1/tokens › policy': { from: 'signed-in', to: 'signed-in.full-tokens' },
}

/** flattenSurface: nested surface JSON → path → value; a list is a set of paths with "" values (as in surface_test.go). */
export function flattenSurface(v, prefix = '', out = {}) {
  const join = (k) => (prefix === '' ? k : prefix + SEP + k)
  if (Array.isArray(v)) {
    for (const el of v) out[join(String(el))] = ''
  } else if (v !== null && typeof v === 'object') {
    for (const [k, sub] of Object.entries(v)) flattenSurface(sub, join(k), out)
  } else {
    out[prefix] = v === null ? 'null' : String(v)
  }
  return out
}

/** The path of a route's request field, the only kind of entry that may become optional. */
const REQUEST_FIELD = /^routes › [A-Z]+ \S+ › request › /

/** A request field that became optional (workspace-fields): compatible, as internal/httpapi compareSurface reads it. */
const relaxed = (p, was, now) => REQUEST_FIELD.test(p) && now === `${was}?`

/** surfaceProblems: entries of the tagged snapshot that are missing or changed in the current one. */
export function surfaceProblems(tagged, current, tag = FREEZE_TAG, allowed = SECURITY_NARROWINGS) {
  const was = flattenSurface(tagged)
  const now = flattenSurface(current)
  const problems = []
  for (const [p, v] of Object.entries(was)) {
    if (p === 'about') continue
    if (!(p in now)) problems.push(`${p}: present at ${tag}, missing now`)
    else if (now[p] !== v && !(allowed[p]?.from === v && allowed[p]?.to === now[p]) && !relaxed(p, v, now[p])) problems.push(`${p}: was ${JSON.stringify(v)} at ${tag}, now ${JSON.stringify(now[p])}`)
  }
  return problems.sort()
}

/** checkSurfaceFreeze: problems against the tag in the repository at root, or null when the tag does not exist yet. */
export function checkSurfaceFreeze(root, tag = FREEZE_TAG) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 })
  try {
    git('rev-parse', '--verify', '--quiet', `refs/tags/${tag}`)
  } catch {
    return null
  }
  const tagged = JSON.parse(git('show', `${tag}:${SURFACE_FILE}`))
  const current = JSON.parse(readFileSync(path.join(root, SURFACE_FILE), 'utf8'))
  return surfaceProblems(tagged, current, tag)
}
