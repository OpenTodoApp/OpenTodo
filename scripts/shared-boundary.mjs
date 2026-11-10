// The shared-code boundary of the native app (OpenSpec change native-app-foundation,
// design D2 and D3): a module of web/src/lib listed in mobile/app/shared-modules.json
// runs in the app too, so it reaches its host only through the platform port
// (web/src/lib/platform.ts), never through a browser global. A text check, with
// comments and string literals left out; run by scripts/repo-checks.test.mjs.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export const SHARED_MODULES_FILE = 'mobile/app/shared-modules.json'
export const PORT = 'web/src/lib/platform.ts'
export const BROWSER_GLOBALS = ['window', 'document', 'navigator', 'localStorage', 'BroadcastChannel', 'indexedDB']

/** The source with comments and the text of string literals blanked, line breaks kept. */
export function codeOnly(src) {
  const blank = (s) => s.replace(/[^\n]/g, ' ')
  return src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\[\s\S]|[^`\\])*`/g, blank)
}

/** Each browser global the module's code names directly, once per line: [{ global, line }]. */
export function browserGlobals(src) {
  const code = codeOnly(src)
  const seen = new Map()
  const re = new RegExp(`(?<![\\w$.])(${BROWSER_GLOBALS.join('|')})(?![\\w$])`, 'g')
  for (const m of code.matchAll(re)) {
    const line = code.slice(0, m.index).split('\n').length
    seen.set(`${line} ${m[1]}`, { global: m[1], line })
  }
  return [...seen.values()]
}

/** The problems of the listed modules; empty when the boundary holds. */
export function boundaryProblems(root, list = JSON.parse(readFileSync(path.join(root, SHARED_MODULES_FILE), 'utf8')).modules) {
  const problems = []
  for (const rel of list) {
    if (rel === PORT) continue
    const file = path.join(root, rel)
    if (!existsSync(file)) {
      problems.push(`${SHARED_MODULES_FILE} lists ${rel}, which does not exist`)
      continue
    }
    for (const { global, line } of browserGlobals(readFileSync(file, 'utf8'))) {
      problems.push(`${rel}:${line} uses the browser global ${global}; a module the app shares reaches its host through the platform port (${PORT})`)
    }
  }
  return problems
}
