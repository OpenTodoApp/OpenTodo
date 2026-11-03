// The documents of the notes fixture (OpenSpec change performance-10k, design D7):
// real Yjs documents written by the web app's own document code
// (web/src/lib/notesSeed.gen.test.ts, run through vitest so its TypeScript and
// yjs are the app's), one JSON line per save, from a fixed seed.
//
//   node scripts/perf/notes-seed.mjs <out.jsonl> [--notes 500] [--saves 300] [--chars 10000]
//
// cmd/perfseed -notes <out.jsonl> writes them into the 10,000-task account.
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const out = args.find((a) => !a.startsWith('--'))
if (!out) {
  console.error('usage: node scripts/perf/notes-seed.mjs <out.jsonl> [--notes 500] [--saves 300] [--chars 10000]')
  process.exit(2)
}
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : def
}
const env = {
  ...process.env,
  NOTES_SEED_OUT: resolve(out),
  NOTES_SEED_NOTES: opt('notes', '500'),
  NOTES_SEED_SAVES: opt('saves', '300'),
  NOTES_SEED_CHARS: opt('chars', '10000'),
}
const web = new URL('../../web/', import.meta.url).pathname
const r = spawnSync('npx', ['vitest', 'run', 'src/lib/notesSeed.gen.test.ts'], { cwd: web, env, stdio: 'inherit' })
process.exit(r.status ?? 1)
