// Compiles the What's new entries (OpenSpec change whats-new, design D1). Every news/<version>.md
// file (front matter: version, date; then at most four plain sentences) becomes one entry of
// web/src/generated/news.json, the lazy module Settings → About loads when the card opens, and the
// newest version alone goes to web/src/generated/newsLatest.json, the tiny module the About row's
// dot reads. Nothing is fetched: the entries ship inside the client.
//
//   node scripts/news-build.mjs           writes both generated files
//   node scripts/news-build.mjs --check   fails when a committed file is not current, or the news is wrong
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SCHEMA = 1
export const NEWS_DIR = 'news'
export const OUT = 'web/src/generated/news.json'
export const INDEX_OUT = 'web/src/generated/newsIndex.json'
export const CHANGELOG = 'CHANGELOG.md'
export const MAX_SENTENCES = 4

const VERSION = /^\d+\.\d+\.\d+$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

/** Numeric, so 0.10.0 sorts after 0.9.0. */
export function compareVersions(a, b) {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}

/** The sentences of a body: runs ending in . ! or ?, so "v0.19.0" and "e.g." inside a sentence still count once. */
export function sentences(body) {
  return body.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
}

/** One news file -> { entry } or { problems }. The body is plain text: its lines join with single spaces. */
export function parseNews(name, text) {
  const problems = []
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text)
  if (!m) return { problems: [`${name}: missing front matter (version and date between --- lines)`] }
  const fields = Object.fromEntries(m[1].split('\n').map((line) => {
    const i = line.indexOf(':')
    return i < 0 ? [line.trim(), ''] : [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
  }))
  const version = fields.version ?? ''
  const date = fields.date ?? ''
  if (!VERSION.test(version)) problems.push(`${name}: version "${version}" is not x.y.z`)
  if (version && name !== `${version}.md`) problems.push(`${name}: the file is named for version ${version}, it must be ${version}.md`)
  if (!DATE.test(date)) problems.push(`${name}: date "${date}" is not YYYY-MM-DD`)
  const body = m[2].split('\n').map((l) => l.trim()).filter(Boolean).join(' ')
  const count = sentences(body).length
  if (!body) problems.push(`${name}: the body is empty`)
  if (count > MAX_SENTENCES) problems.push(`${name}: the body has ${count} sentences; at most ${MAX_SENTENCES}`)
  if (problems.length) return { problems }
  return { entry: { version, date, body } }
}

/** The versions of a changelog's released sections, "## [0.19.0] - 2026-10-31" (Unreleased is not one). */
export function changelogVersions(text) {
  return [...text.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map((m) => m[1])
}

/**
 * Every news file -> entries (newest first) and the problems that stop them. `files` is
 * [{ name, text }] (README files are not news and are left out by the caller).
 */
export function buildNews({ files, changelog = '' }) {
  const problems = []
  const entries = []
  for (const f of files) {
    const r = parseNews(f.name, f.text)
    if (r.problems) problems.push(...r.problems)
    else entries.push(r.entry)
  }
  const versions = entries.map((e) => e.version)
  const dupes = versions.filter((v, i) => versions.indexOf(v) !== i)
  for (const v of new Set(dupes)) problems.push(`two news entries for version ${v}`)
  // The first news file starts the series; a released version newer than it needs its entry (design D1).
  if (versions.length && changelog) {
    const first = [...versions].sort(compareVersions)[0]
    for (const v of changelogVersions(changelog)) {
      if (compareVersions(v, first) > 0 && !versions.includes(v)) {
        problems.push(`${CHANGELOG} has a section [${v}] with no ${NEWS_DIR}/${v}.md (the news series starts at ${first})`)
      }
    }
  }
  entries.sort((a, b) => compareVersions(b.version, a.version))
  return { entries, problems }
}

/** The committed outputs for the entries: the lazy list and the index (versions, newest first). */
export function outputs(entries) {
  return {
    [OUT]: JSON.stringify({ schema: SCHEMA, entries }, null, 1) + '\n',
    [INDEX_OUT]: JSON.stringify({ latest: entries[0]?.version ?? null, versions: entries.map((e) => e.version) }) + '\n',
  }
}

/** Reads the news folder and the changelog under `root`. */
export function readNews(root = repoRoot) {
  const dir = join(root, NEWS_DIR)
  const files = existsSync(dir)
    ? readdirSync(dir).filter((name) => name.endsWith('.md') && name !== 'README.md').sort().map((name) => ({ name, text: readFileSync(join(dir, name), 'utf8') }))
    : []
  const changelogPath = join(root, CHANGELOG)
  const changelog = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : ''
  return { files, changelog }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { entries, problems } = buildNews(readNews())
  if (problems.length) {
    console.error(`news: ${problems.length} problem(s)\n${problems.map((p) => `  - ${p}`).join('\n')}`)
    process.exit(1)
  }
  const outs = outputs(entries)
  if (process.argv.includes('--check')) {
    const stale = Object.keys(outs).filter((out) => {
      const path = join(repoRoot, out)
      return !existsSync(path) || readFileSync(path, 'utf8') !== outs[out]
    })
    if (stale.length) {
      console.error(`news: ${stale.join(', ')} ${stale.length > 1 ? 'are' : 'is'} stale; run node scripts/news-build.mjs`)
      process.exit(1)
    }
    console.log(`news: ${entries.length} entries, current`)
  } else {
    for (const [out, text] of Object.entries(outs)) writeFileSync(join(repoRoot, out), text)
    console.log(`news: ${entries.length} entries written`)
  }
}
