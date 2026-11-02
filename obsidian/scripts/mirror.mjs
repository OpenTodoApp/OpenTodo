// Fills a checkout of the plugin's release repository (OpenTodoApp/obsidian-opentodo,
// obsidian-plugin D1) from obsidian/dist for one OpenTodo release. Obsidian reads
// manifest.json, versions.json and the README from the root of that repository and
// installs main.js, manifest.json and styles.css from the release of the tag
// (attached by mirror/release.yml). The community directory's automated review also
// reads the source there, installs its dependencies, runs `npm run build` and checks
// that the result is the released main.js (obsidian-plugin D14). So the repository
// also gets the source the bundle is built from, in the same layout as in OpenTodo:
//
//   obsidian/            the plugin's sources that main.ts reaches, its locales,
//                        esbuild.config.mjs, styles.css and manifest.json
//   web/src/...          the shared modules of the web app the plugin bundles
//   package.json         `npm run build` = node obsidian/esbuild.config.mjs --outdir .
//   package-lock.json    obsidian/package-lock.json (esbuild and the API's types)
//   tsconfig.json        type-checks exactly these files
//
// Run after `make obsidian`:
//
//   node obsidian/scripts/mirror.mjs 0.20.0 /path/to/obsidian-opentodo
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const REPO = here('../..')

/** Relative module specifiers a TypeScript file names: imports, re-exports and import('…') types. */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)['"](\.{1,2}\/[^'"]+)['"]/gm

/** web/src/lib/i18n and i18n/catalog are replaced by the plugin's shim at build time (esbuild.config.mjs). */
const SHIMMED = /\/web\/src\/lib\/i18n(\/(index|catalog))?\.ts$/

function resolveModule(from, spec) {
  const base = resolve(dirname(from), spec)
  for (const c of [base, `${base}.ts`, join(base, 'index.ts')]) if (existsSync(c) && statSync(c).isFile()) return c
  throw new Error(`${relative(REPO, from)}: cannot resolve ${spec}`)
}

/**
 * Every file of the repository the plugin's entry point reaches, by value or by
 * type, with the i18n modules left out (the shim stands in for them). Repository-
 * relative paths, sorted.
 */
export function sources(entry = here('../src/main.ts')) {
  const seen = new Set()
  const walk = (file) => {
    if (seen.has(file)) return
    seen.add(file)
    if (!file.endsWith('.ts')) return
    for (const m of readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
      const target = resolveModule(file, m[1])
      if (SHIMMED.test(target)) {
        walk(here('../src/shims/i18n.ts'))
        continue
      }
      walk(target)
    }
  }
  walk(entry)
  return [...seen].map((f) => relative(REPO, f)).sort()
}

const I18N_STUB = `// In OpenTodo this module is the web app's message catalogue. The plugin's build
// replaces it with obsidian/src/shims/i18n.ts (esbuild.config.mjs), so this
// repository carries only the replacement, for the type-checker.
export { t, msg, currentLanguage } from '../../../../obsidian/src/shims/i18n'
`

const TSCONFIG = {
  compilerOptions: {
    target: 'ES2022', lib: ['ES2022', 'DOM', 'DOM.Iterable'], module: 'ESNext', moduleResolution: 'bundler',
    strict: true, noUnusedLocals: true, noUnusedParameters: true, noFallthroughCasesInSwitch: true,
    skipLibCheck: true, isolatedModules: true, noEmit: true, resolveJsonModule: true, types: [],
  },
  include: ['obsidian/src', 'web/src'],
}

export function mirror(version, dir, { dist = here('../dist') } = {}) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`version must be X.Y.Z (Obsidian tags have no "v"), got ${version}`)
  const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'))
  manifest.version = version
  const manifestText = JSON.stringify(manifest, null, 2) + '\n'
  writeFileSync(join(dir, 'manifest.json'), manifestText)
  for (const f of ['main.js', 'styles.css']) copyFileSync(join(dist, f), join(dir, f))
  const versionsPath = join(dir, 'versions.json')
  const versions = existsSync(versionsPath) ? JSON.parse(readFileSync(versionsPath, 'utf8')) : {}
  versions[version] = manifest.minAppVersion
  writeFileSync(versionsPath, JSON.stringify(versions, null, 2) + '\n')
  copyFileSync(here('../README.md'), join(dir, 'README.md'))
  copyFileSync(here('../LICENSE'), join(dir, 'LICENSE'))
  mkdirSync(join(dir, '.github/workflows'), { recursive: true })
  copyFileSync(here('../mirror/release.yml'), join(dir, '.github/workflows/release.yml'))

  // The source, replacing what an earlier release left.
  for (const d of ['obsidian', 'web']) rmSync(join(dir, d), { recursive: true, force: true })
  const files = [...sources(), 'obsidian/esbuild.config.mjs', 'obsidian/styles.css']
  for (const f of files) {
    mkdirSync(dirname(join(dir, f)), { recursive: true })
    copyFileSync(join(REPO, f), join(dir, f))
  }
  writeFileSync(join(dir, 'obsidian/manifest.json'), manifestText)
  for (const f of ['index.ts', 'catalog.ts']) {
    mkdirSync(join(dir, 'web/src/lib/i18n'), { recursive: true })
    writeFileSync(join(dir, 'web/src/lib/i18n', f), I18N_STUB)
  }
  const pkg = JSON.parse(readFileSync(here('../package.json'), 'utf8'))
  const rootPkg = {
    name: pkg.name,
    version,
    private: true,
    description: 'OpenTodo for Obsidian, built from OpenTodo (https://github.com/OpenTodoApp/OpenTodo, obsidian/). npm ci && npm run build writes main.js and styles.css here.',
    license: pkg.license,
    type: 'module',
    scripts: { build: 'node obsidian/esbuild.config.mjs --outdir .' },
    devDependencies: pkg.devDependencies,
  }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(rootPkg, null, 2) + '\n')
  const lock = JSON.parse(readFileSync(here('../package-lock.json'), 'utf8'))
  lock.version = version
  if (lock.packages?.['']) lock.packages[''].version = version
  writeFileSync(join(dir, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n')
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(TSCONFIG, null, 2) + '\n')
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\n')
  return manifest
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [version, dir] = process.argv.slice(2)
  if (!version || !dir) {
    console.error('usage: node obsidian/scripts/mirror.mjs <version> <dir>')
    process.exit(2)
  }
  mirror(version, dir)
  console.log(`obsidian: ${dir} holds the plugin ${version}`)
}
