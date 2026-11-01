// Routine templates, the starters of OpenSpec change routines-starters (design D1-D3, D6):
// every templates/routines/<slug>/ folder holds routine.yaml (English) and optional
// <language>.yaml translations. This module checks them (templates/README.md, "Routine
// templates") and compiles them for the app (web/src/generated/routineStarters.json, no
// tests), for the Go test that runs each one (internal/rules/testdata/starters.json, with
// tests) and for the site bundle. The type check is the shared checker's, in TypeScript
// (web/src/lib/rules/starters.test.ts) and Go (internal/rules/starters_test.go).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { parseYaml, YAML_TEMPLATE } from './deploy/yaml.mjs'
import { CATEGORIES, iconNames, overlayLanguages, personalData, repoRoot, showPath } from './templates-check.mjs'

export const ROUTINES_DIR = 'routines'
export const ROUTINE_SCHEMA = 1
export const MAX_ROUTINE_FILE_BYTES = 16 * 1024
export const MAX_ROUTINE_STEPS = 20
export const ROUTINE_LIMITS = { title: 60, summary: 160, description: 2000, name: 120, suggest: 120 }
export const ASK_TYPES = ['project', 'label']
const TOP_KEYS = ['title', 'summary', 'description', 'category', 'icon', 'author', 'reviewed', 'ask', 'trigger', 'condition', 'steps', 'test']
const TEST_KEYS = ['fill', 'run_on', 'email', 'projects', 'labels', 'tasks', 'expect']
/** Step inputs whose text literal is translated (design D1); `template` only in Format text. */
export const TEXT_INPUTS = ['text', 'title', 'subject', 'template', 'name', 'reason']
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DAY = /^\d{4}-\d{2}-\d{2}$/
const ASK_NAME = /^[a-z][a-z0-9_]{0,30}$/
const BLOCKS = ['then', 'otherwise', 'do']

/** The step kinds of the catalogue: the `kind:` entries of the shared step table (web/src/lib/rules/steps.ts). */
export function stepKinds(root = repoRoot) {
  const src = readFileSync(join(root, 'web/src/lib/rules/steps.ts'), 'utf8')
  const table = /export const STEPS: StepKind\[\] = \[([\s\S]*?)\n\]/.exec(src)
  if (!table) throw new Error('routine templates: no step table found in web/src/lib/rules/steps.ts')
  return new Set([...table[1].matchAll(/\{ kind: '([a-z_]+)'/g)].map((m) => m[1]))
}

/** The values a text inserts (`{b}`, `{trigger}`), sorted: a translation must keep them. */
export const insertedValues = (text) => [...new Set([...text.matchAll(/\{([a-z0-9_]{1,16})\}/g)].map((m) => m[1]))].sort()

const isMap = (v) => !!v && typeof v === 'object' && !Array.isArray(v)
const isAsk = (v) => isMap(v) && Object.keys(v).length === 1 && typeof v.ask === 'string'

/** Every step with its dotted path (`steps.2`, `steps.2.then.0`), in order. */
export function walkSteps(steps, path = 'steps', out = []) {
  ;(Array.isArray(steps) ? steps : []).forEach((s, i) => {
    const p = `${path}.${i}`
    out.push([p, s])
    for (const b of BLOCKS) if (isMap(s) && Array.isArray(s[b])) walkSteps(s[b], `${p}.${b}`, out)
  })
  return out
}

/** The text of a translatable input's literal: a string or `{format}`. */
function inputText(arg) {
  if (!isMap(arg) || !('literal' in arg)) return null
  const v = arg.literal
  if (typeof v === 'string') return v
  if (isMap(v) && typeof v.format === 'string' && Object.keys(v).length === 1) return v.format
  return null
}

/** Every translatable string of a routine source, by dotted path (design D1). */
export function routineTextPaths(src) {
  const out = new Map()
  for (const k of ['title', 'summary', 'description']) if (typeof src[k] === 'string') out.set(k, src[k])
  if (isMap(src.ask)) for (const [name, a] of Object.entries(src.ask)) if (isMap(a) && typeof a.suggest === 'string') out.set(`ask.${name}.suggest`, a.suggest)
  for (const [p, s] of walkSteps(src.steps)) {
    if (!isMap(s) || !isMap(s.in)) continue
    for (const name of TEXT_INPUTS) {
      // `template` is a text only in Format text (Create a project from a template names a library template).
      if (name === 'template' && s.kind !== 'format') continue
      const text = inputText(s.in[name])
      if (text !== null) out.set(`${p}.in.${name}`, text)
    }
  }
  return out
}

/** A short hash of the English text a translation was made from (as for project templates). */
export function routineSourceHash(src) {
  const h = createHash('sha256')
  for (const [k, v] of routineTextPaths(src)) h.update(`${k}\0${v}\0`)
  return 'sha-' + h.digest('hex').slice(0, 12)
}

/** Every `{ask}` placeholder with its path, anywhere in a value. */
function asksIn(v, path, out) {
  if (isAsk(v)) { out.push([path, v.ask]); return out }
  if (Array.isArray(v)) v.forEach((x, i) => asksIn(x, `${path}.${i}`, out))
  else if (isMap(v)) for (const [k, x] of Object.entries(v)) asksIn(x, `${path}.${k}`, out)
  return out
}

/** Field and structure rules of routine.yaml (spec "Routine template validation"). */
export function checkRoutineSource(src, { fail, icons, kinds }) {
  for (const k of Object.keys(src)) if (!TOP_KEYS.includes(k)) fail(k, `unknown field (allowed: ${TOP_KEYS.join(', ')})`)
  const text = (path, v, max, links = false) => {
    if (typeof v !== 'string' || !v.trim()) { fail(path, v === undefined ? 'is required' : 'must be text'); return }
    if (v.length > max) fail(path, `is ${v.length} characters, at most ${max}`)
    const pd = personalData(v, links)
    if (pd) fail(path, pd)
  }
  text('title', src.title, ROUTINE_LIMITS.title)
  text('summary', src.summary, ROUTINE_LIMITS.summary)
  text('description', src.description, ROUTINE_LIMITS.description, true)
  text('author', src.author, ROUTINE_LIMITS.name)
  if (!CATEGORIES.includes(src.category)) fail('category', `must be one of ${CATEGORIES.join(', ')}`)
  if (!icons.has(src.icon)) fail('icon', `"${src.icon}" is not in the icon catalogue`)
  if (typeof src.reviewed !== 'string' || !DAY.test(src.reviewed) || Number.isNaN(Date.parse(src.reviewed))) fail('reviewed', 'must be a date, YYYY-MM-DD')

  // Choices: declared once, each a project or a label with a suggested name, each used.
  const declared = new Map()
  if (src.ask !== undefined && !isMap(src.ask)) fail('ask', 'must be a map of choices')
  for (const [name, a] of Object.entries(isMap(src.ask) ? src.ask : {})) {
    const p = `ask.${name}`
    if (!ASK_NAME.test(name)) fail(p, 'a choice name is lowercase letters, digits and underscores')
    if (!isMap(a)) { fail(p, 'must be a map with type and suggest'); continue }
    for (const k of Object.keys(a)) if (!['type', 'suggest'].includes(k)) fail(`${p}.${k}`, 'unknown field (allowed: type, suggest)')
    if (!ASK_TYPES.includes(a.type)) fail(`${p}.type`, `must be ${ASK_TYPES.join(' or ')}`)
    text(`${p}.suggest`, a.suggest, ROUTINE_LIMITS.suggest)
    declared.set(name, a.type)
  }
  if (!isMap(src.trigger) || typeof src.trigger.kind !== 'string') fail('trigger', 'must be a trigger with a kind')
  if (src.condition !== undefined && src.condition !== null && !isMap(src.condition)) fail('condition', 'must be a condition')
  if (!Array.isArray(src.steps) || src.steps.length === 0) fail('steps', 'must list at least one step')
  const used = new Set()
  for (const [path, name] of [...asksIn(src.trigger, 'trigger', []), ...asksIn(src.condition, 'condition', []), ...asksIn(src.steps, 'steps', [])]) {
    used.add(name)
    if (!declared.has(name)) fail(path, `choice "${name}" is not declared`)
  }
  for (const name of declared.keys()) if (!used.has(name)) fail(`ask.${name}`, `choice "${name}" is declared but not used`)

  // Steps: known kinds, no task chosen by hand, at most 20.
  const all = walkSteps(src.steps)
  if (all.length > MAX_ROUTINE_STEPS) fail('steps', `holds ${all.length} steps, at most ${MAX_ROUTINE_STEPS}`)
  for (const [p, s] of all) {
    if (!isMap(s)) { fail(p, 'must be a step with an id and a kind'); continue }
    if (typeof s.id !== 'string' || !/^[a-z0-9]{1,8}$/.test(s.id)) fail(`${p}.id`, 'must be a short id (lowercase letters and digits)')
    if (!kinds.has(s.kind)) fail(`${p}.kind`, `step kind "${s.kind}" does not exist`)
    if (s.kind === 'get_task') fail(`${p}.kind`, 'a starter never holds a task chosen by hand (Get a specific task)')
    for (const [name, arg] of Object.entries(isMap(s.in) ? s.in : {})) {
      if (isMap(arg) && isMap(arg.literal) && 'task' in arg.literal) fail(`${p}.in.${name}`, 'a starter never holds a task chosen by hand ({task: id})')
    }
  }

  // The test (design D3): every choice filled.
  if (!isMap(src.test)) { fail('test', 'is required: the seeded data and the writes the starter must make'); return }
  for (const k of Object.keys(src.test)) if (!TEST_KEYS.includes(k)) fail(`test.${k}`, `unknown field (allowed: ${TEST_KEYS.join(', ')})`)
  if (!isMap(src.test.expect)) fail('test.expect', 'is required')
  const fill = isMap(src.test.fill) ? src.test.fill : {}
  for (const name of declared.keys()) if (typeof fill[name] !== 'string' || !fill[name]) fail(`test.fill.${name}`, `choice "${name}" needs an id`)
  for (const name of Object.keys(fill)) if (!declared.has(name)) fail(`test.fill.${name}`, `choice "${name}" is not declared`)
}

/** Reads one routine template folder: { slug, src, overlays, problems, warnings }. */
export function readRoutineTemplate(dir, opts = {}) {
  const root = opts.root ?? repoRoot
  const slug = dir.split(/[\\/]/).pop()
  const id = `${ROUTINES_DIR}/${slug}`
  const problems = []
  const warnings = []
  const fail = (file, path, msg) => problems.push(`${id}/${file}${path ? `: ${showPath(path)}` : ''}: ${msg}`)
  const warn = (file, path, msg) => warnings.push(`${id}/${file}${path ? `: ${showPath(path)}` : ''}: ${msg}`)
  const out = { slug, src: null, overlays: {}, problems, warnings }
  if (!SLUG.test(slug)) fail('', '', 'folder name must be lowercase letters, digits and hyphens')
  if (!existsSync(join(dir, 'routine.yaml'))) { fail('routine.yaml', '', 'missing'); return out }
  const read = (name) => {
    const p = join(dir, name)
    const bytes = statSync(p).size
    if (bytes > MAX_ROUTINE_FILE_BYTES) { fail(name, '', `is ${bytes} bytes, at most ${MAX_ROUTINE_FILE_BYTES}`); return null }
    try { return parseYaml(readFileSync(p, 'utf8'), YAML_TEMPLATE) } catch (err) { fail(name, '', err.message); return null }
  }
  const src = read('routine.yaml')
  if (!src) return out
  if (!isMap(src)) { fail('routine.yaml', '', 'must be a map'); return out }
  out.src = src
  checkRoutineSource(src, { fail: (path, msg) => fail('routine.yaml', path, msg), icons: opts.icons ?? iconNames(root), kinds: opts.kinds ?? stepKinds(root) })

  const languages = opts.languages ?? overlayLanguages(root)
  const paths = routineTextPaths(src)
  const hash = routineSourceHash(src)
  for (const name of readdirSync(dir).sort()) {
    if (name === 'routine.yaml') continue
    const m = /^([a-z]{2})\.yaml$/.exec(name)
    if (!m || !languages.includes(m[1])) { fail(name, '', `unexpected file; translations are ${languages.map((l) => `${l}.yaml`).join(', ')}`); continue }
    const doc = read(name)
    if (!doc) continue
    if (!isMap(doc)) { fail(name, '', 'must be a map of paths to text'); continue }
    const texts = {}
    for (const [key, value] of Object.entries(doc)) {
      if (key === 'sourceHash') {
        if (value !== hash) warn(name, '', `the English text changed since this translation (sourceHash ${value}, now ${hash}); check it and update sourceHash`)
        continue
      }
      if (!paths.has(key)) { fail(name, key, 'is not in the English source (a translation holds only text, never structure)'); continue }
      if (typeof value !== 'string' || !value.trim()) { fail(name, key, 'must be text'); continue }
      const pd = personalData(value, key === 'description')
      if (pd) fail(name, key, pd)
      const want = insertedValues(paths.get(key))
      const got = insertedValues(value)
      if (want.join() !== got.join()) fail(name, key, `must insert the same values as the English text (${want.map((v) => `{${v}}`).join(', ') || 'none'}), not ${got.map((v) => `{${v}}`).join(', ') || 'none'}`)
      texts[key] = value
    }
    out.overlays[m[1]] = texts
  }
  return out
}

/** Every routine template, checked, plus the library-wide rule (unique English titles). */
export function checkRoutineLibrary(root = repoRoot, opts = {}) {
  const dir = opts.dir ?? join(root, 'templates', ROUTINES_DIR)
  const routines = []
  const problems = []
  const warnings = []
  if (!existsSync(dir)) return { routines, problems, warnings }
  const ctx = { root, icons: opts.icons ?? iconNames(root), kinds: opts.kinds ?? stepKinds(root), languages: opts.languages ?? overlayLanguages(root) }
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name)
    if (!statSync(p).isDirectory()) continue
    const r = readRoutineTemplate(p, ctx)
    problems.push(...r.problems)
    warnings.push(...r.warnings)
    routines.push(r)
  }
  const titles = new Map()
  for (const r of routines) {
    const title = r.src?.title
    if (typeof title !== 'string') continue
    const key = title.trim().toLowerCase()
    if (titles.has(key)) problems.push(`${ROUTINES_DIR}/${r.slug}/routine.yaml: title: "${title}" is also the title of ${ROUTINES_DIR}/${titles.get(key)}`)
    else titles.set(key, r.slug)
  }
  return { routines, problems, warnings }
}

/** One routine template -> its compiled entry; `withTest` keeps the test (the Go copy). */
export function compileRoutine({ slug, src, overlays }, withTest = false) {
  const langs = Object.keys(overlays).sort()
  const L = (path, en) => {
    const out = { en }
    for (const lang of langs) if (overlays[lang][path] !== undefined) out[lang] = overlays[lang][path]
    return out
  }
  const texts = {}
  for (const [path, en] of routineTextPaths(src)) if (path.startsWith('steps.')) texts[path] = L(path, en)
  const ask = {}
  for (const [name, a] of Object.entries(src.ask ?? {})) ask[name] = { type: a.type, suggest: L(`ask.${name}.suggest`, a.suggest) }
  const entry = {
    slug,
    category: src.category,
    icon: src.icon,
    author: src.author,
    reviewed: src.reviewed,
    languages: ['en', ...langs],
    text: { title: L('title', src.title), summary: L('summary', src.summary), description: L('description', src.description.trimEnd()) },
    ask,
    trigger: src.trigger,
    ...(src.condition ? { condition: src.condition } : {}),
    steps: src.steps,
    texts,
  }
  if (withTest) entry.test = src.test
  return entry
}

const ORDER = ['personal', 'home', 'work', 'study', 'method']

/** Every routine template compiled, categories in a fixed order, then English title. */
export function compileRoutines(root = repoRoot, opts = {}) {
  const { routines, problems, warnings } = checkRoutineLibrary(root, opts)
  if (problems.length) return { app: null, server: null, problems, warnings }
  const sorted = [...routines].sort((a, b) => ORDER.indexOf(a.src.category) - ORDER.indexOf(b.src.category) || a.src.title.localeCompare(b.src.title))
  return {
    app: { schema: ROUTINE_SCHEMA, starters: sorted.map((r) => compileRoutine(r)) },
    server: { schema: ROUTINE_SCHEMA, starters: sorted.map((r) => compileRoutine(r, true)) },
    problems,
    warnings,
  }
}
