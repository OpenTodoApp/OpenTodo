// The template library (OpenSpec change template-library): the curated templates of this
// release, compiled from templates/ into generated/templates.json by `make templates` and
// loaded as a lazy chunk the service worker precaches (design D5), so the library works
// offline and costs the first screen nothing. A library template becomes an ordinary
// TemplateTree with its relative offsets resolved from the start day (D3), then goes
// through the same planner as every copy.
import { addDaysISO, logicalToday } from './dates'
import { currentLanguage, t } from './i18n'
import { projectsAndLabels } from './localData'
import { mutateMany } from './ops'
import { saveViewMode } from './sections'
import { planTree, type Plan, type TemplateTree, type TProject, type TTask } from './templates'

/** Text in English and the languages it is translated into; a missing language falls back to English. */
export type Localized = { en: string } & Partial<Record<string, string>>

export interface LibraryTask {
  title: Localized
  description?: Localized
  priority?: number
  due?: string
  time?: string
  recurrence?: string
  estimate?: number
  /** Indexes into the template's labels. */
  labels?: number[]
  subtasks?: LibraryTask[]
}

export interface LibrarySection { name: Localized; color?: string; icon?: string; tasks?: LibraryTask[] }
export interface LibraryProject { name: Localized; color?: string; icon?: string; tasks?: LibraryTask[]; sections?: LibrarySection[] }

export type TemplateCategory = 'personal' | 'home' | 'work' | 'study' | 'method'

export interface LibraryTemplate {
  slug: string
  category: TemplateCategory
  icon: string
  layout?: 'list' | 'board'
  author: string
  reviewed: string
  docs: string[]
  languages: string[]
  text: { title: Localized; summary: Localized; description: Localized; howToUse: Localized[]; makeItYours: Localized[] }
  labels: { name: Localized; color?: string }[]
  projects: LibraryProject[]
  counts: { projects: number; sections: number; tasks: number; labels: number }
}

export interface Library { schema: number; templates: LibraryTemplate[] }

let cache: Promise<Library> | null = null

/** The library of this release; one lazy chunk, loaded when the template dialog opens. */
export function loadLibrary(): Promise<Library> {
  cache ??= import('../generated/templates.json').then((m) => m.default as Library)
  return cache
}

/** `text` in `lang`, else English. */
export const pick = (text: Localized, lang: string = currentLanguage()): string => text[lang] ?? text.en

export const CATEGORY_ORDER: readonly TemplateCategory[] = ['personal', 'home', 'work', 'study', 'method']

/** The heading of a category, in the interface language. */
export function categoryName(c: TemplateCategory): string {
  switch (c) {
    case 'personal': return t('Personal')
    case 'home': return t('Home')
    case 'work': return t('Work')
    case 'study': return t('Study')
    case 'method': return t('Method')
  }
}

// ---- offsets (design D3) ----

const OFFSET = /^\+(\d+)([dwm])$/

/**
 * The date an offset lands on from `startDay`: `+0d` is the start day, `+1w` seven days
 * later, `+1m` the same day of the next month, or its last day when that month is shorter.
 */
export function resolveOffset(offset: string, startDay: string): string {
  const m = OFFSET.exec(offset)
  if (!m) throw new Error(`invalid offset ${offset}`)
  const n = Number(m[1])
  if (m[2] === 'd') return addDaysISO(startDay, n)
  if (m[2] === 'w') return addDaysISO(startDay, 7 * n)
  const [y, mo, d] = startDay.split('-').map(Number)
  const month = mo - 1 + n
  const year = y + Math.floor(month / 12)
  const mm = ((month % 12) + 12) % 12
  const last = new Date(Date.UTC(year, mm + 1, 0)).getUTCDate()
  return `${year}-${String(mm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

/** How the preview names an offset, counted from 1: `+0d` is "day 1", `+1w` "week 2", `+2m` "month 3". */
export function offsetLabel(offset: string): string {
  const m = OFFSET.exec(offset)
  if (!m) return offset
  const n = Number(m[1]) + 1
  return m[2] === 'd' ? t('day {n}', { n }) : m[2] === 'w' ? t('week {n}', { n }) : t('month {n}', { n })
}

// ---- the tree ----

/**
 * A library template as the planner's tree, in `lang`, with every offset resolved from
 * `startDay` (today when there is none) and the start day as its reference day, so the
 * planner shifts nothing.
 */
export function libraryTree(tpl: LibraryTemplate, lang: string, startDay?: string | null): TemplateTree {
  const day = startDay || logicalToday()
  const labelName = (i: number) => pick(tpl.labels[i].name, lang)
  const task = (tk: LibraryTask): TTask => ({
    title: pick(tk.title, lang),
    description: tk.description ? pick(tk.description, lang) : '',
    priority: tk.priority ?? 4,
    due: tk.due ? (tk.time ? { date: resolveOffset(tk.due, day), time: tk.time } : { date: resolveOffset(tk.due, day) }) : null,
    labels: (tk.labels ?? []).map(labelName),
    estimate_minutes: tk.estimate ?? null,
    recurrence: tk.recurrence ?? null,
    subtasks: (tk.subtasks ?? []).map(task),
  })
  const project = (p: LibraryProject, i: number): TProject => ({
    name: pick(p.name, lang),
    color: p.color ?? PALETTE[i % PALETTE.length],
    icon: p.icon ?? (i === 0 ? tpl.icon : null),
    tasks: (p.tasks ?? []).map(task),
    sections: (p.sections ?? []).map((s) => ({ name: pick(s.name, lang), tasks: (s.tasks ?? []).map(task) })),
    children: [],
  })
  return {
    labels: tpl.labels.map((l) => ({ name: pick(l.name, lang), ...(l.color ? { color: l.color } : {}) })),
    projects: tpl.projects.map(project),
    day,
  }
}

const PALETTE = ['#059669', '#2563eb', '#d97706', '#7c3aed', '#db2777', '#0891b2']

/**
 * Starts a library template: one batch of ops on this device (queued offline, converging
 * like any copy), the board layout when the template asks for it. Returns the plan.
 */
export async function startLibraryTemplate(tpl: LibraryTemplate, opts: { lang?: string; startDay?: string | null; parentId?: string | null } = {}): Promise<Plan> {
  const tree = libraryTree(tpl, opts.lang ?? currentLanguage(), opts.startDay)
  const plan = planTree(tree, { ...(await projectsAndLabels()), parentId: opts.parentId ?? null, startDay: tree.day })
  await mutateMany(plan.changes)
  if (tpl.layout === 'board' && plan.projectIds[0]) await saveViewMode(plan.projectIds[0], 'board')
  return plan
}

// ---- search ----

/** Every text a search may match, in `lang` and in English. */
function haystack(tpl: LibraryTemplate, lang: string): string {
  const parts: string[] = []
  const both = (l: Localized | undefined) => { if (l) { parts.push(l.en); if (l[lang]) parts.push(l[lang]!) } }
  both(tpl.text.title)
  both(tpl.text.summary)
  parts.push(tpl.category, categoryName(tpl.category))
  tpl.labels.forEach((l) => both(l.name))
  const tasks = (list: LibraryTask[] | undefined) => (list ?? []).forEach((tk) => { both(tk.title); tasks(tk.subtasks) })
  tpl.projects.forEach((p) => { tasks(p.tasks); (p.sections ?? []).forEach((s) => tasks(s.tasks)) })
  return parts.join('\n').toLocaleLowerCase()
}

/** The templates whose title, summary, category, labels or tasks contain every word of `query`. */
export function searchLibrary(templates: LibraryTemplate[], query: string, lang: string = currentLanguage()): LibraryTemplate[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return templates
  return templates.filter((tpl) => {
    const text = haystack(tpl, lang)
    return words.every((w) => text.includes(w))
  })
}

/** Templates grouped by category, in the library's order. */
export function byCategory(templates: LibraryTemplate[]): { category: TemplateCategory; templates: LibraryTemplate[] }[] {
  return CATEGORY_ORDER.map((category) => ({ category, templates: templates.filter((x) => x.category === category) })).filter((g) => g.templates.length)
}

/** What starting the template would add: labels new on this device and labels reused by name. */
export function labelPlan(tpl: LibraryTemplate, lang: string, existing: { name: string; deleted_at?: number | null }[]): { added: string[]; reused: string[] } {
  const have = new Set(existing.filter((l) => !l.deleted_at).map((l) => l.name.toLowerCase()))
  const added: string[] = []
  const reused: string[] = []
  for (const l of tpl.labels) {
    const name = pick(l.name, lang)
    ;(have.has(name.toLowerCase()) ? reused : added).push(name)
  }
  return { added, reused }
}
