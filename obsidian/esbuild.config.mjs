// Builds the plugin into one main.js (obsidian-plugin task 3.1), the format
// Obsidian loads on desktop and mobile: CommonJS, `obsidian` and the editor
// packages provided by the app, everything else bundled. The web app's i18n
// modules are replaced by src/shims/i18n.ts, so the shared code (quick add,
// recurrence, the envelope primitives) comes without the web catalogue or React.
// The build fails above the size budget or when the bundle needs a Node or
// Electron module, which Obsidian mobile does not have.
//
//   node esbuild.config.mjs            build dist/main.js (+ manifest.json, styles.css)
//   node esbuild.config.mjs --watch    rebuild on change, for development in a test vault
import { builtinModules } from 'node:module'
import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))

/** The budget of main.js, minified: 250 KB in obsidian-plugin, 400 KB with the vault engine (obsidian-vault-sync, design "Size"). */
export const BUDGET_BYTES = 400 * 1024

/** Modules Obsidian provides at run time. */
const EXTERNAL = ['obsidian', 'electron', '@codemirror/*', '@lezer/*', ...builtinModules, ...builtinModules.map((m) => `node:${m}`)]

const shimI18n = {
  name: 'opentodo-shim-i18n',
  setup(build) {
    build.onResolve({ filter: /^(\.{1,2}\/)+i18n(\/catalog)?$/ }, (args) => {
      if (!args.importer.includes('/web/src/lib/')) return undefined
      return { path: here('./src/shims/i18n.ts') }
    })
  },
}

/** Requires of modules mobile Obsidian does not have; the test in src/bundle.test.ts checks the same. */
export const FORBIDDEN = [/require\(["'](?:node:)?(?:fs|path|os|child_process|crypto|net|http|https|electron)["']\)/, /child_process/]

export async function build({ watch = false, outdir = here('./dist') } = {}) {
  mkdirSync(outdir, { recursive: true })
  const options = {
    entryPoints: [here('./src/main.ts')],
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    minify: !watch,
    sourcemap: watch ? 'inline' : false,
    treeShaking: true,
    legalComments: 'none',
    external: EXTERNAL,
    outfile: `${outdir}/main.js`,
    plugins: [shimI18n],
    logLevel: 'warning',
    banner: { js: '/* OpenTodo for Obsidian. AGPL-3.0-only. Source: https://github.com/OpenTodoApp/OpenTodo/tree/main/obsidian */' },
  }
  if (watch) {
    const ctx = await esbuild.context(options)
    await ctx.watch()
    return
  }
  await esbuild.build(options)
  copyFileSync(here('./manifest.json'), `${outdir}/manifest.json`)
  copyFileSync(here('./styles.css'), `${outdir}/styles.css`)
  const size = statSync(`${outdir}/main.js`).size
  const js = readFileSync(`${outdir}/main.js`, 'utf8')
  const bad = FORBIDDEN.filter((re) => re.test(js))
  if (bad.length) throw new Error(`main.js uses a module Obsidian mobile does not have: ${bad.join(', ')}`)
  if (size > BUDGET_BYTES) throw new Error(`main.js is ${(size / 1024).toFixed(1)} KB, over the ${BUDGET_BYTES / 1024} KB budget`)
  console.log(`obsidian: dist/main.js ${(size / 1024).toFixed(1)} KB of ${BUDGET_BYTES / 1024} KB`)
  return size
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await build({ watch: process.argv.includes('--watch') })
}
