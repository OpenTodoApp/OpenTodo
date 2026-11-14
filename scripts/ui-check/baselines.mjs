#!/usr/bin/env node
// The visual baselines live on the `ui-baselines` branch, one commit that is replaced on
// every refresh, so main's history no longer grows with each new copy of every PNG
// (OpenSpec ui-baselines-branch). A pull request carries only its new or changed
// baselines under web/src/ui/__screenshots__; after it merges, the UI baselines workflow
// folds them into the branch and removes them from main.
//
//   fetch            assemble web/.ui-baselines: the branch's PNGs (before the branch exists,
//                    main's), then this checkout's web/src/ui/__screenshots__/*.png over them
//   collect [dir]    copy the PNGs of web/.ui-baselines that differ from what fetch assembled
//                    (new or rewritten by Playwright) into dir, default web/src/ui/__screenshots__
//   commit           write web/.ui-baselines as a parentless commit and print its id
//
// UI_BASELINES_REPO overrides the repository fetched from (a URL or a remote name).
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const TREE = join(root, 'web/src/ui/__screenshots__')
export const WORK = join(root, 'web/.ui-baselines')
const MANIFEST = join(WORK, '.manifest.json')
const BRANCH = 'ui-baselines'
const TREE_PATH = 'web/src/ui/__screenshots__'
const repo = process.env.UI_BASELINES_REPO ?? 'https://github.com/OpenTodoApp/OpenTodo.git'

const git = (args, opts = {}) => execFileSync('git', ['-c', 'safe.directory=*', ...args], { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts })
const tryGit = (args) => { try { return git(args) } catch { return null } }
const pngs = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png')).sort() : [])
const hash = (file) => createHash('sha1').update(readFileSync(file)).digest('hex')

// Extract `ref:path` (path '' = the whole tree) into dir; true when it held any PNG.
function extract(ref, path, dir) {
  const spec = path ? `${ref}:${path}` : ref
  if (tryGit(['cat-file', '-e', spec]) === null) return false
  const tar = spawnSync('git', ['-c', 'safe.directory=*', 'archive', '--format=tar', spec], { cwd: root, maxBuffer: 1 << 30 })
  if (tar.status !== 0) return false
  const x = spawnSync('tar', ['-x', '-C', dir], { input: tar.stdout, maxBuffer: 1 << 30 })
  return x.status === 0 && pngs(dir).length > 0
}

// The base set: the branch, else main's tree, else (just after main dropped its PNGs and
// before the branch was first written) main's parent. null when nothing is reachable.
function base(dir) {
  if (tryGit(['fetch', '--quiet', '--depth=1', '--no-tags', repo, `refs/heads/${BRANCH}`]) !== null && extract('FETCH_HEAD', '', dir)) return `${BRANCH} branch`
  if (tryGit(['fetch', '--quiet', '--depth=2', '--no-tags', repo, 'refs/heads/main']) !== null) {
    if (extract('FETCH_HEAD', TREE_PATH, dir)) return 'main (no ui-baselines branch yet)'
    if (extract('FETCH_HEAD^', TREE_PATH, dir)) return "main's parent (no ui-baselines branch yet)"
  }
  return null
}

function fetch() {
  const tmp = mkdtempSync(join(tmpdir(), 'ui-baselines-'))
  try {
    const from = base(tmp)
    if (from === null) {
      if (existsSync(MANIFEST)) {
        console.log(`ui-baselines: offline; keeping ${pngs(WORK).length} baselines already in web/.ui-baselines`)
        return
      }
      console.log('ui-baselines: no branch reachable; using only web/src/ui/__screenshots__')
    }
    rmSync(WORK, { recursive: true, force: true })
    mkdirSync(WORK, { recursive: true })
    for (const f of pngs(tmp)) copyFileSync(join(tmp, f), join(WORK, f))
    const own = pngs(TREE)
    for (const f of own) copyFileSync(join(TREE, f), join(WORK, f))
    const manifest = Object.fromEntries(pngs(WORK).map((f) => [f, hash(join(WORK, f))]))
    writeFileSync(MANIFEST, JSON.stringify(manifest))
    console.log(`ui-baselines: ${pngs(tmp).length} from ${from ?? 'nowhere'}, ${own.length} from this checkout`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

function collect(out = TREE) {
  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {}
  mkdirSync(out, { recursive: true })
  const changed = pngs(WORK).filter((f) => manifest[f] !== hash(join(WORK, f)))
  for (const f of changed) copyFileSync(join(WORK, f), join(out, f))
  console.log(`ui-baselines: ${changed.length} new or changed baselines copied to ${out}`)
}

function commit() {
  const files = pngs(WORK)
  if (files.length === 0) throw new Error('ui-baselines: web/.ui-baselines is empty; run fetch first')
  const ids = git(['hash-object', '-w', '--stdin-paths'], { input: files.map((f) => join(WORK, f)).join('\n') }).trim().split('\n')
  const tree = git(['mktree'], { input: files.map((f, i) => `100644 blob ${ids[i]}\t${f}\n`).join('') }).trim()
  const id = git(['commit-tree', tree, '-m', `UI baselines (${files.length} images)`]).trim()
  console.log(id)
}

const [cmd, arg] = process.argv.slice(2)
if (cmd === 'fetch') fetch()
else if (cmd === 'collect') collect(arg ? resolve(arg) : undefined)
else if (cmd === 'commit') commit()
else {
  console.error('usage: node scripts/ui-check/baselines.mjs fetch | collect [dir] | commit')
  process.exit(2)
}
