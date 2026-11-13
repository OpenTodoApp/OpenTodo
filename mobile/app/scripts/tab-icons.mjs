// The tab bar's icons on Android (native-app-everyday D6): the web app's own icons
// (Lucide, ISC: web/src/ui/icons/LICENSE-lucide.txt) written as SVG files the native tab
// bar loads. iOS uses SF Symbols. Run after changing ICONS: node scripts/tab-icons.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const app = join(dirname(fileURLToPath(import.meta.url)), '..')
const ICONS = { today: 'sun', inbox: 'inbox', upcoming: 'calendar-days', browse: 'folder', search: 'search' }

const source = readFileSync(join(app, '../../web/src/ui/icons/lucide.ts'), 'utf8')
const out = join(app, 'src/assets')
mkdirSync(out, { recursive: true })
for (const [tab, name] of Object.entries(ICONS)) {
  const line = source.split('\n').find((l) => l.startsWith(`  ${JSON.stringify(name)}:`))
  if (!line) throw new Error(`no icon ${name} in web/src/ui/icons/lucide.ts`)
  const body = JSON.parse(line.slice(line.indexOf(':') + 1).trim().replace(/,$/, ''))
  writeFileSync(join(out, `tab-${tab}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>\n`)
}
