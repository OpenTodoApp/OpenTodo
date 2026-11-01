// Routine starters (OpenSpec change routines-starters, design D1, D5): the routine
// templates of this release, compiled from templates/routines/ into
// generated/routineStarters.json by `make templates` and loaded as a lazy chunk
// with the starters list, so they work offline and cost the first screen nothing.
// A starter becomes an ordinary routine draft once its choices (a project or a
// label, `{ask: name}` in place of the id) are filled. Pure apart from loading.
import { currentLanguage } from '../i18n'
import { resettable } from '../moduleState'
import type { Localized, TemplateCategory } from '../templateLibrary'
import type { RoutineArg, RoutineStep, RuleCondition, RuleTrigger } from '../types'
import type { RoutineDraft } from './draft'
import { kindText, stepName } from './sentence'
import { stepKind, walkSteps } from './steps'

/** `text` in `lang`, else English. */
export const pick = (text: Localized, lang: string = currentLanguage()): string => text[lang] ?? text.en

export interface StarterChoice { type: 'project' | 'label'; suggest: Localized }

export interface Starter {
  slug: string
  category: TemplateCategory
  icon: string
  author: string
  reviewed: string
  languages: string[]
  text: { title: Localized; summary: Localized; description: Localized }
  /** The choices, by name, in the order the starter declares them. */
  ask: Record<string, StarterChoice>
  trigger: RuleTrigger
  condition?: RuleCondition
  /** The steps in English, with `{ask: name}` in place of a chosen id. */
  steps: RoutineStep[]
  /** The steps' texts by path (`steps.2.in.text`), in every language. */
  texts: Record<string, Localized>
}

export interface StarterLibrary { schema: number; starters: Starter[] }

let cache: Promise<StarterLibrary> | null = null

/** The starters of this release; one lazy chunk, loaded when a starters list is shown. */
export function loadStarters(): Promise<StarterLibrary> {
  cache ??= import('../../generated/routineStarters.json').then((m) => m.default as unknown as StarterLibrary)
  return cache
}
resettable('routineStarters', () => { cache = null })

/** The choices still empty in `values`, by name. */
export const missingChoices = (s: Starter, values: Record<string, string>): string[] => Object.keys(s.ask).filter((name) => !values[name])

const isAsk = (v: unknown): v is { ask: string } => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && typeof (v as { ask?: unknown }).ask === 'string'

/** `v` with every `{ask: name}` replaced by the chosen id ('' while unchosen). */
function fill<T>(v: T, values: Record<string, string>): T {
  if (isAsk(v)) return (values[v.ask] ?? '') as T
  if (Array.isArray(v)) return v.map((x) => fill(x, values)) as T
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x, values)])) as T
  return v
}

/** Sets the text of the input at `path` (`steps.2.then.0.in.text`), keeping its form (a text or a `{format}`). */
function setText(steps: RoutineStep[], path: string, text: string): void {
  const parts = path.split('.').slice(1)
  let list: RoutineStep[] | undefined = steps
  let step: RoutineStep | undefined
  while (parts.length > 2 && list) {
    step = list[Number(parts.shift())]
    if (parts[0] === 'in') break
    list = step?.[parts.shift() as 'then' | 'otherwise' | 'do']
  }
  const input = parts[1]
  const arg: RoutineArg | undefined = step?.in?.[input]
  if (!step?.in || !arg || !('literal' in arg)) return
  const lit = arg.literal
  step.in[input] = { literal: lit && typeof lit === 'object' && 'format' in (lit as object) ? { format: text } : text }
}

/** A starter's steps in `lang`, choices still as `{ask}`. */
export function starterSteps(s: Starter, lang: string = currentLanguage()): RoutineStep[] {
  const steps = structuredClone(s.steps)
  for (const [path, text] of Object.entries(s.texts)) setText(steps, path, pick(text, lang))
  return steps
}

/**
 * A starter as an editor draft: its title as the name, its texts in `lang`,
 * its choices filled with the chosen ids (an unchosen one stays '').
 */
export function starterDraft(s: Starter, values: Record<string, string>, lang: string = currentLanguage()): RoutineDraft {
  return {
    name: pick(s.text.title, lang),
    trigger: fill(structuredClone(s.trigger), values),
    condition: s.condition ? fill(structuredClone(s.condition), values) : null,
    steps: fill(starterSteps(s, lang), values),
    aiApply: '',
    aiBudget: 0,
  }
}

/** The step kinds a starter uses (nested blocks included), each once, in order. */
export function starterKinds(s: Starter): string[] {
  const out: string[] = []
  walkSteps(s.steps, (st) => { if (!out.includes(st.kind)) out.push(st.kind) })
  return out
}

/** The kinds of a starter that need something set up (email, today's focus, time tracking, a webhook). */
export const starterNeeds = (s: Starter): string[] => starterKinds(s).filter((k) => !!stepKind(k)?.needs)

/** The words a starter is found by: title, summary and step names, in `lang` and English. */
function searchText(s: Starter, lang: string): string {
  const names = starterKinds(s).flatMap((k) => [stepName(k), kindText(k)?.name ?? ''])
  return [pick(s.text.title, lang), pick(s.text.summary, lang), s.text.title.en, s.text.summary.en, ...names].join(' ').toLocaleLowerCase()
}

/** The starters matching every word of `query`, in the library's order. */
export function searchStarters(list: readonly Starter[], query: string, lang: string = currentLanguage()): Starter[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return [...list]
  return list.filter((s) => {
    const text = searchText(s, lang)
    return words.every((w) => text.includes(w))
  })
}
