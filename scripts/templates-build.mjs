// Compiles the template library (OpenSpec change template-library, design D1, D4): every
// templates/<slug>/ folder, checked by scripts/templates-check.mjs, becomes one entry of
// web/src/generated/templates.json, the module the app's template dialog loads lazily and
// the site bundle publishes, and its copy internal/templatelib/library.json, embedded in
// the server for a routine's Create a project from a template step (routines-engine). Text is a map per language ({en, it, ...}; a missing language
// falls back to English), labels are referenced by index, offsets stay relative, no ids.
//
//   node scripts/templates-build.mjs           writes web/src/generated/templates.json
//   node scripts/templates-build.mjs --check   fails when the committed file is not current
import { readFileSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkLibrary, repoRoot } from './templates-check.mjs'
import { compileRoutines } from './routine-templates.mjs'

export const SCHEMA = 1
export const OUT = 'web/src/generated/templates.json'
export const SERVER_OUT = 'internal/templatelib/library.json'
/** The routine starters (routines-starters D2, D3): the app's lazy module, and the Go test's copy with each starter's test. */
export const ROUTINES_OUT = 'web/src/generated/routineStarters.json'
export const ROUTINES_TEST_OUT = 'internal/rules/testdata/starters.json'
/** The compiled library is a lazy chunk; this keeps it from growing unnoticed (design Risks). */
export const BUDGET_GZIP_BYTES = 100 * 1024

/** One template folder (read by checkLibrary) -> its compiled entry. */
export function compileTemplate({ slug, src, overlays }) {
  const langs = Object.keys(overlays).sort()
  const L = (path, en) => {
    const out = { en }
    for (const lang of langs) if (overlays[lang][path] !== undefined) out[lang] = overlays[lang][path]
    return out
  }
  const labelIndex = new Map((src.labels ?? []).map((l, i) => [l.name.toLowerCase(), i]))
  let tasksCount = 0
  let sectionsCount = 0
  const task = (tk, path) => {
    tasksCount++
    const out = { title: L(`${path}.title`, tk.title) }
    if (tk.description !== undefined) out.description = L(`${path}.description`, tk.description)
    if (tk.priority !== undefined) out.priority = tk.priority
    if (tk.due !== undefined) out.due = String(tk.due)
    if (tk.time !== undefined) out.time = String(tk.time)
    if (tk.recurrence !== undefined) out.recurrence = tk.recurrence
    if (tk.estimate !== undefined) out.estimate = tk.estimate
    if (tk.labels?.length) out.labels = [...new Set(tk.labels.map((n) => labelIndex.get(String(n).toLowerCase())))]
    if (tk.subtasks?.length) out.subtasks = tk.subtasks.map((s, i) => task(s, `${path}.subtasks.${i}`))
    return out
  }
  const projects = src.projects.map((pr, i) => {
    const p = { name: L(`projects.${i}.name`, pr.name) }
    if (pr.color !== undefined) p.color = pr.color
    if (pr.icon !== undefined) p.icon = pr.icon
    if (pr.tasks?.length) p.tasks = pr.tasks.map((tk, j) => task(tk, `projects.${i}.tasks.${j}`))
    if (pr.sections?.length) {
      p.sections = pr.sections.map((s, j) => {
        sectionsCount++
        const sec = { name: L(`projects.${i}.sections.${j}.name`, s.name) }
        if (s.color !== undefined) sec.color = s.color
        if (s.icon !== undefined) sec.icon = s.icon
        if (s.tasks?.length) sec.tasks = s.tasks.map((tk, k) => task(tk, `projects.${i}.sections.${j}.tasks.${k}`))
        return sec
      })
    }
    return p
  })
  const entry = {
    slug,
    category: src.category,
    icon: src.icon,
    ...(src.layout ? { layout: src.layout } : {}),
    author: src.author,
    reviewed: src.reviewed,
    docs: src.docs ?? [],
    languages: ['en', ...langs],
    text: {
      title: L('title', src.title),
      summary: L('summary', src.summary),
      description: L('description', src.description.trimEnd()),
      howToUse: src.howToUse.map((s, i) => L(`howToUse.${i}`, s)),
      makeItYours: src.makeItYours.map((s, i) => L(`makeItYours.${i}`, s)),
    },
    labels: (src.labels ?? []).map((l, i) => ({ name: L(`labels.${i}.name`, l.name), ...(l.color ? { color: l.color } : {}) })),
    projects,
  }
  entry.counts = { projects: projects.length, sections: sectionsCount, tasks: tasksCount, labels: entry.labels.length }
  return entry
}

/** The whole library, or the problems that stop it. Categories in a fixed order, then English title. */
export function compileLibrary(root = repoRoot, opts = {}) {
  const { templates, problems, warnings } = checkLibrary(root, opts)
  if (problems.length) return { library: null, problems, warnings }
  const ORDER = ['personal', 'home', 'work', 'study', 'method']
  const entries = templates.map(compileTemplate)
    .sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category) || a.text.title.en.localeCompare(b.text.title.en))
  const library = { schema: SCHEMA, templates: entries }
  const size = gzipSync(serialise(library)).length
  if (size > BUDGET_GZIP_BYTES) problems.push(`templates: the compiled library is ${size} bytes gzipped, over the budget of ${BUDGET_GZIP_BYTES}; split or trim templates`)
  return { library: problems.length ? null : library, problems, warnings }
}

export const serialise = (library) => JSON.stringify(library, null, 1) + '\n'

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { library, problems, warnings } = compileLibrary()
  const routines = compileRoutines()
  problems.push(...routines.problems)
  warnings.push(...routines.warnings)
  for (const w of warnings) console.warn(`warning: ${w}`)
  if (!library || problems.length) {
    console.error(`templates: ${problems.length} problem(s)\n${problems.map((p) => `  - ${p}`).join('\n')}`)
    process.exit(1)
  }
  const text = serialise(library)
  const outputs = [[OUT, text], [SERVER_OUT, text], [ROUTINES_OUT, serialise(routines.app)], [ROUTINES_TEST_OUT, serialise(routines.server)]]
  const summary = `${library.templates.length} templates, ${routines.app.starters.length} routine starters`
  if (process.argv.includes('--check')) {
    for (const [out, want] of outputs) {
      let current = ''
      try { current = readFileSync(join(repoRoot, out), 'utf8') } catch { /* missing */ }
      if (current !== want) {
        console.error(`templates: ${out} is out of date; run \`make templates\``)
        process.exit(1)
      }
    }
    console.log(`templates: ${outputs.map(([o]) => o).join(', ')} are current (${summary})`)
  } else {
    for (const [out, data] of outputs) writeFileSync(join(repoRoot, out), data)
    console.log(`templates: wrote ${outputs.map(([o]) => o).join(', ')} (${summary}, ${gzipSync(text).length} and ${gzipSync(outputs[2][1]).length} bytes gzipped)`)
  }
}
