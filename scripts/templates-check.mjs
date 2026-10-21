// The template library check (OpenSpec change template-library, design D6): every folder
// in templates/ is read with the repository's YAML reader and held to the format in
// templates/README.md. Problems name the template, the file and the path; CI, `make
// check`, the compiler (scripts/templates-build.mjs) and the site bundle all use it.
//
//   node scripts/templates-check.mjs        prints the problems and warnings, exits 1 on a problem
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseYaml, YAML_TEMPLATE } from './deploy/yaml.mjs'

const here = fileURLToPath(import.meta.url)
export const repoRoot = resolve(dirname(here), '..')

export const CATEGORIES = ['personal', 'home', 'work', 'study', 'method']
export const LAYOUTS = ['list', 'board']
export const MAX_TASKS = 200
export const MAX_FILE_BYTES = 64 * 1024
export const LIMITS = { title: 60, summary: 160, description: 2000, step: 200, steps: 5, name: 120, taskTitle: 200, taskDescription: 2000 }
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const OFFSET = /^\+(\d+)([dwm])$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const COLOR = /^#[0-9a-fA-F]{6}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/

const TOP_KEYS = ['title', 'summary', 'description', 'howToUse', 'makeItYours', 'category', 'icon', 'layout', 'author', 'reviewed', 'docs', 'labels', 'projects']
const PROJECT_KEYS = ['name', 'color', 'icon', 'sections', 'tasks']
const SECTION_KEYS = ['name', 'tasks']
const SECTION_STYLE = ['color', 'icon']
const TASK_KEYS = ['title', 'description', 'priority', 'due', 'time', 'recurrence', 'estimate', 'labels', 'subtasks']

/** The interface languages a translation file may be written in (every shipped catalogue but English). */
export function overlayLanguages(root = repoRoot) {
  return readdirSync(join(root, 'web/src/locales')).filter((f) => /^[a-z]{2}\.json$/.test(f)).map((f) => f.slice(0, 2)).sort()
}

/**
 * Icon names a template may use: the icon catalogue of change icons-and-section-style when
 * it exists (web/src/ui/icons/catalogue.json), else the project icons the app offers today.
 */
export function iconNames(root = repoRoot) {
  const catalogue = join(root, 'web/src/ui/icons/catalogue.json')
  if (existsSync(catalogue)) {
    const list = JSON.parse(readFileSync(catalogue, 'utf8'))
    return new Set(list.map((e) => (typeof e === 'string' ? e : e.name)))
  }
  const src = readFileSync(join(root, 'web/src/app/ProjectHeader.tsx'), 'utf8')
  const block = /export const PROJECT_ICONS[^=]*=\s*\[([\s\S]*?)\]/.exec(src)
  if (!block) throw new Error('templates: no icon list found (catalogue.json or PROJECT_ICONS)')
  return new Set([...block[1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]))
}

/** Section colour and icon exist once change icons-and-section-style adds them to the section entity. */
export function sectionStyleSupported(root = repoRoot) {
  const ops = readFileSync(join(root, 'internal/sync/ops.go'), 'utf8')
  const section = /"section":\s*\{([\s\S]*?)\n\t\}/.exec(ops)
  return !!section && /"icon":/.test(section[1]) && /"color":/.test(section[1])
}

/** `projects.0.sections.1.tasks.2.title` -> `projects[0].sections[1].tasks[2].title`, for messages. */
export const showPath = (p) => p.replace(/\.(\d+)(?=\.|$)/g, '[$1]')

// ---- personal data (design D6) ----

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const PHONE = /(?:\+|\b00)\d[\d ()./-]{6,}\d|\b\d{3}[ .-]\d{3,4}[ .-]\d{3,4}\b/
const ANY_URL = /\b(?:https?:\/\/|www\.)\S+/gi

/** What makes `text` unfit for a public template, or null. `links`: https links allowed (descriptions). */
export function personalData(text, links) {
  if (EMAIL.test(text)) return 'holds an e-mail address'
  if (PHONE.test(text)) return 'holds a phone number'
  for (const m of text.matchAll(ANY_URL)) {
    if (!links) return 'holds a URL (only descriptions may link, with https)'
    if (!/^https:\/\//i.test(m[0])) return `holds a link that is not https: ${m[0]}`
  }
  return null
}

// ---- the source ----

/**
 * Every translatable string of a source, by dotted path, in source order. These are the
 * only keys a translation file may hold (design D4).
 */
export function translatablePaths(src) {
  const out = new Map()
  const put = (path, v) => { if (typeof v === 'string') out.set(path, v) }
  for (const k of ['title', 'summary', 'description']) put(k, src[k])
  for (const k of ['howToUse', 'makeItYours']) (Array.isArray(src[k]) ? src[k] : []).forEach((v, i) => put(`${k}.${i}`, v))
  ;(Array.isArray(src.labels) ? src.labels : []).forEach((l, i) => put(`labels.${i}.name`, l?.name))
  const tasks = (list, path) => (Array.isArray(list) ? list : []).forEach((tk, i) => {
    const p = `${path}.${i}`
    put(`${p}.title`, tk?.title)
    put(`${p}.description`, tk?.description)
    tasks(tk?.subtasks, `${p}.subtasks`)
  })
  ;(Array.isArray(src.projects) ? src.projects : []).forEach((pr, i) => {
    put(`projects.${i}.name`, pr?.name)
    tasks(pr?.tasks, `projects.${i}.tasks`)
    ;(Array.isArray(pr?.sections) ? pr.sections : []).forEach((s, j) => {
      put(`projects.${i}.sections.${j}.name`, s?.name)
      tasks(s?.tasks, `projects.${i}.sections.${j}.tasks`)
    })
  })
  return out
}

/** A short hash of the English text a translation was made from (stale-translation warning, design Risks). */
export function sourceHash(src) {
  const h = createHash('sha256')
  for (const [k, v] of translatablePaths(src)) h.update(`${k}\0${v}\0`)
  return 'sha-' + h.digest('hex').slice(0, 12)
}

/** Reads one template folder: { slug, src, overlays: {lang: {path: text}}, files, problems, warnings }. */
export function readTemplate(dir, opts = {}) {
  const root = opts.root ?? repoRoot
  const slug = dir.split(/[\\/]/).pop()
  const problems = []
  const warnings = []
  const fail = (file, path, msg) => problems.push(`${slug}/${file}${path ? `: ${showPath(path)}` : ''}: ${msg}`)
  const warn = (file, path, msg) => warnings.push(`${slug}/${file}${path ? `: ${showPath(path)}` : ''}: ${msg}`)
  const out = { slug, src: null, overlays: {}, problems, warnings }
  if (!SLUG.test(slug)) fail('', '', 'folder name must be lowercase letters, digits and hyphens')
  const file = join(dir, 'template.yaml')
  if (!existsSync(file)) { fail('template.yaml', '', 'missing'); return out }
  const read = (name) => {
    const p = join(dir, name)
    const bytes = statSync(p).size
    if (bytes > MAX_FILE_BYTES) { fail(name, '', `is ${bytes} bytes, at most ${MAX_FILE_BYTES}`); return null }
    try { return parseYaml(readFileSync(p, 'utf8'), YAML_TEMPLATE) } catch (err) { fail(name, '', err.message); return null }
  }
  const src = read('template.yaml')
  if (!src) return out
  if (typeof src !== 'object' || Array.isArray(src)) { fail('template.yaml', '', 'must be a map'); return out }
  out.src = src
  checkSource(src, { fail: (path, msg) => fail('template.yaml', path, msg), icons: opts.icons ?? iconNames(root), sectionStyle: opts.sectionStyle ?? sectionStyleSupported(root), root })

  const languages = opts.languages ?? overlayLanguages(root)
  const paths = translatablePaths(src)
  const hash = sourceHash(src)
  for (const name of readdirSync(dir).sort()) {
    if (name === 'template.yaml') continue
    const m = /^([a-z]{2})\.yaml$/.exec(name)
    if (!m || !languages.includes(m[1])) { fail(name, '', `unexpected file; translations are ${languages.map((l) => `${l}.yaml`).join(', ')}`); continue }
    const doc = read(name)
    if (!doc) continue
    if (typeof doc !== 'object' || Array.isArray(doc)) { fail(name, '', 'must be a map of paths to text'); continue }
    const texts = {}
    for (const [key, value] of Object.entries(doc)) {
      if (key === 'sourceHash') {
        if (value !== hash) warn(name, '', `the English text changed since this translation (sourceHash ${value}, now ${hash}); check it and update sourceHash`)
        continue
      }
      if (!paths.has(key)) { fail(name, key, 'is not in the English source (a translation holds only text, never structure)'); continue }
      if (typeof value !== 'string' || !value.trim()) { fail(name, key, 'must be text'); continue }
      const links = /(^|\.)description$/.test(key)
      const pd = personalData(value, links)
      if (pd) fail(name, key, pd)
      texts[key] = value
    }
    out.overlays[m[1]] = texts
  }
  return out
}

const isText = (v) => typeof v === 'string' && v.trim() !== ''

/** Field rules of template.yaml (spec "Template sources in the repository"). */
export function checkSource(src, { fail, icons, sectionStyle, root = repoRoot }) {
  for (const k of Object.keys(src)) if (!TOP_KEYS.includes(k)) fail(k, `unknown field (allowed: ${TOP_KEYS.join(', ')})`)
  const text = (path, v, max, { links = false, required = true } = {}) => {
    if (v === undefined || v === null) { if (required) fail(path, 'is required'); return }
    if (!isText(v)) { fail(path, 'must be text'); return }
    if (v.length > max) fail(path, `is ${v.length} characters, at most ${max}`)
    const pd = personalData(v, links)
    if (pd) fail(path, pd)
  }
  text('title', src.title, LIMITS.title)
  text('summary', src.summary, LIMITS.summary)
  text('description', src.description, LIMITS.description, { links: true })
  for (const k of ['howToUse', 'makeItYours']) {
    const v = src[k]
    if (!Array.isArray(v) || v.length < 1 || v.length > LIMITS.steps) fail(k, `must list 1 to ${LIMITS.steps} steps`)
    else v.forEach((s, i) => text(`${k}.${i}`, s, LIMITS.step))
  }
  if (!CATEGORIES.includes(src.category)) fail('category', `must be one of ${CATEGORIES.join(', ')}`)
  if (!icons.has(src.icon)) fail('icon', `"${src.icon}" is not in the icon catalogue`)
  if (src.layout !== undefined && !LAYOUTS.includes(src.layout)) fail('layout', `must be ${LAYOUTS.join(' or ')}`)
  text('author', src.author, LIMITS.name)
  if (typeof src.reviewed !== 'string' || !DAY.test(src.reviewed) || Number.isNaN(Date.parse(src.reviewed))) fail('reviewed', 'must be a date, YYYY-MM-DD')
  if (src.docs !== undefined) {
    if (!Array.isArray(src.docs)) fail('docs', 'must be a list of documentation pages')
    else src.docs.forEach((d, i) => {
      if (typeof d !== 'string' || !/^[a-z0-9/-]+\.md$/.test(d) || !existsSync(join(root, 'docs', d))) fail(`docs.${i}`, `"${d}" is not a page in docs/`)
    })
  }

  const labels = new Map()
  if (src.labels !== undefined && !Array.isArray(src.labels)) fail('labels', 'must be a list')
  ;(Array.isArray(src.labels) ? src.labels : []).forEach((l, i) => {
    const p = `labels.${i}`
    if (!l || typeof l !== 'object') { fail(p, 'must be a map with a name'); return }
    for (const k of Object.keys(l)) if (!['name', 'color'].includes(k)) fail(`${p}.${k}`, 'unknown field (allowed: name, color)')
    text(`${p}.name`, l.name, LIMITS.name)
    if (l.color !== undefined && !COLOR.test(String(l.color))) fail(`${p}.color`, 'must be a colour like #0891b2')
    if (isText(l.name)) {
      const key = l.name.toLowerCase()
      if (labels.has(key)) fail(`${p}.name`, `label "${l.name}" is declared twice`)
      labels.set(key, i)
    }
  })

  let count = 0
  const tasks = (list, path) => {
    if (list === undefined) return
    if (!Array.isArray(list)) { fail(path, 'must be a list of tasks'); return }
    list.forEach((tk, i) => {
      const p = `${path}.${i}`
      count++
      if (!tk || typeof tk !== 'object') { fail(p, 'must be a task with a title'); return }
      for (const k of Object.keys(tk)) if (!TASK_KEYS.includes(k)) fail(`${p}.${k}`, `unknown field (allowed: ${TASK_KEYS.join(', ')})`)
      text(`${p}.title`, tk.title, LIMITS.taskTitle)
      if (tk.description !== undefined) text(`${p}.description`, tk.description, LIMITS.taskDescription, { links: true })
      if (tk.priority !== undefined && ![1, 2, 3, 4].includes(tk.priority)) fail(`${p}.priority`, 'must be 1, 2, 3 or 4')
      if (tk.due !== undefined && !OFFSET.test(String(tk.due))) fail(`${p}.due`, 'must be an offset from the start day: +Nd, +Nw or +Nm')
      if (tk.time !== undefined) {
        if (tk.due === undefined) fail(`${p}.time`, 'needs a due offset')
        else if (!TIME.test(String(tk.time))) fail(`${p}.time`, 'must be HH:MM')
      }
      if (tk.recurrence !== undefined && !isText(tk.recurrence)) fail(`${p}.recurrence`, 'must be a recurrence rule, such as "every week"')
      if (tk.estimate !== undefined && !(Number.isInteger(tk.estimate) && tk.estimate > 0 && tk.estimate <= 24 * 60)) fail(`${p}.estimate`, 'must be minutes, 1 to 1440')
      if (tk.labels !== undefined) {
        if (!Array.isArray(tk.labels)) fail(`${p}.labels`, 'must be a list of label names')
        else for (const name of tk.labels) if (!labels.has(String(name).toLowerCase())) fail(`${p}.labels`, `label "${name}" is not declared`)
      }
      tasks(tk.subtasks, `${p}.subtasks`)
    })
  }
  if (!Array.isArray(src.projects) || src.projects.length === 0) fail('projects', 'must list at least one project')
  ;(Array.isArray(src.projects) ? src.projects : []).forEach((pr, i) => {
    const p = `projects.${i}`
    if (!pr || typeof pr !== 'object') { fail(p, 'must be a project with a name'); return }
    for (const k of Object.keys(pr)) if (!PROJECT_KEYS.includes(k)) fail(`${p}.${k}`, `unknown field (allowed: ${PROJECT_KEYS.join(', ')})`)
    text(`${p}.name`, pr.name, LIMITS.name)
    if (pr.color !== undefined && !COLOR.test(String(pr.color))) fail(`${p}.color`, 'must be a colour like #0891b2')
    if (pr.icon !== undefined && !icons.has(pr.icon)) fail(`${p}.icon`, `"${pr.icon}" is not in the icon catalogue`)
    tasks(pr.tasks, `${p}.tasks`)
    if (pr.sections !== undefined && !Array.isArray(pr.sections)) fail(`${p}.sections`, 'must be a list')
    ;(Array.isArray(pr.sections) ? pr.sections : []).forEach((s, j) => {
      const sp = `${p}.sections.${j}`
      if (!s || typeof s !== 'object') { fail(sp, 'must be a section with a name'); return }
      for (const k of Object.keys(s)) {
        if (SECTION_STYLE.includes(k)) {
          // design D7: accepted once the section entity has a colour and an icon.
          if (!sectionStyle) fail(`${sp}.${k}`, 'section colour and icon need the change icons-and-section-style, which is not in this version yet')
          else if (k === 'color' && !COLOR.test(String(s.color))) fail(`${sp}.color`, 'must be a colour like #0891b2')
          else if (k === 'icon' && !icons.has(s.icon)) fail(`${sp}.icon`, `"${s.icon}" is not in the icon catalogue`)
        } else if (!SECTION_KEYS.includes(k)) fail(`${sp}.${k}`, `unknown field (allowed: ${[...SECTION_KEYS, ...SECTION_STYLE].join(', ')})`)
      }
      text(`${sp}.name`, s.name, LIMITS.name)
      tasks(s.tasks, `${sp}.tasks`)
    })
  })
  if (count > MAX_TASKS) fail('projects', `holds ${count} tasks and subtasks, at most ${MAX_TASKS}`)
}

/** Every template folder of the library, checked, plus the library-wide rules (unique titles). */
export function checkLibrary(root = repoRoot, opts = {}) {
  const dir = opts.dir ?? join(root, 'templates')
  const templates = []
  const problems = []
  const warnings = []
  if (!existsSync(dir)) return { templates, problems: ['templates/: missing'], warnings }
  const icons = opts.icons ?? iconNames(root)
  const sectionStyle = opts.sectionStyle ?? sectionStyleSupported(root)
  const languages = opts.languages ?? overlayLanguages(root)
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name)
    if (!statSync(p).isDirectory()) continue
    const tpl = readTemplate(p, { root, icons, sectionStyle, languages })
    problems.push(...tpl.problems)
    warnings.push(...tpl.warnings)
    templates.push(tpl)
  }
  const titles = new Map()
  for (const tpl of templates) {
    const title = tpl.src?.title
    if (typeof title !== 'string') continue
    const key = title.trim().toLowerCase()
    if (titles.has(key)) problems.push(`${tpl.slug}/template.yaml: title: "${title}" is also the title of ${titles.get(key)}`)
    else titles.set(key, tpl.slug)
  }
  return { templates, problems, warnings }
}

if (process.argv[1] === here) {
  const { templates, problems, warnings } = checkLibrary()
  for (const w of warnings) console.warn(`warning: ${w}`)
  if (problems.length) {
    console.error(`templates: ${problems.length} problem(s)\n${problems.map((p) => `  - ${p}`).join('\n')}`)
    process.exit(1)
  }
  console.log(`templates: ${templates.length} valid template(s)${warnings.length ? `, ${warnings.length} warning(s)` : ''}`)
}
