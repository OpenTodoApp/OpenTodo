// Regenerates the OpenTodo theme documents and the theme derivation's reference values
// from web/src/index.css (OpenSpec change theme-engine, design D9):
// web/src/lib/theme/builtin/opentodo-light.json, opentodo-dark.json and
// web/src/lib/theme/reference.json, then the derivation vectors. index.css stays the
// source of the default tokens; web/src/lib/theme/themes.test.ts fails while the files
// are stale. The generator is the TypeScript in web/src/lib/theme/generate.ts (it reads
// the stylesheet with the same token resolver as the contrast check), so this script
// runs it through the web app's test runner. Run after changing a token:
//
//   node scripts/themes-sync.mjs
import { spawnSync } from 'node:child_process'

const web = new URL('../web/', import.meta.url).pathname
const run = (env, files) => {
  const r = spawnSync('npx', ['vitest', 'run', ...files], { cwd: web, stdio: 'inherit', env: { ...process.env, ...env } })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
run({ UPDATE_THEMES: '1' }, ['src/lib/theme/themes.test.ts'])
run({ UPDATE_THEME_VECTORS: '1' }, ['src/lib/theme/derive.test.ts'])
