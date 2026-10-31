// Fills a checkout of the plugin's release repository (OpenTodoApp/obsidian-opentodo,
// obsidian-plugin D1) from obsidian/dist for one OpenTodo release: manifest.json
// with the release's version, main.js, styles.css, versions.json (every version
// and the oldest Obsidian it runs on), the README, the licence and the workflow that
// attaches the three files to the release of the tag. Obsidian reads all of these
// from the root of that repository. Run after `make obsidian`.
//
//   node obsidian/scripts/mirror.mjs 0.20.0 /path/to/obsidian-opentodo
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))

export function mirror(version, dir, { dist = here('../dist') } = {}) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`version must be X.Y.Z (Obsidian tags have no "v"), got ${version}`)
  const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'))
  manifest.version = version
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  for (const f of ['main.js', 'styles.css']) copyFileSync(join(dist, f), join(dir, f))
  const versionsPath = join(dir, 'versions.json')
  const versions = existsSync(versionsPath) ? JSON.parse(readFileSync(versionsPath, 'utf8')) : {}
  versions[version] = manifest.minAppVersion
  writeFileSync(versionsPath, JSON.stringify(versions, null, 2) + '\n')
  copyFileSync(here('../README.md'), join(dir, 'README.md'))
  copyFileSync(here('../LICENSE'), join(dir, 'LICENSE'))
  mkdirSync(join(dir, '.github/workflows'), { recursive: true })
  copyFileSync(here('../mirror/release.yml'), join(dir, '.github/workflows/release.yml'))
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
