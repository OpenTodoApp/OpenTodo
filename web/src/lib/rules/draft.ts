// The routine editor's draft (OpenSpec change routines-editor, design D1, D2,
// D5 and D6): a routine being edited as plain data, and the edits the editor
// makes to it, each returning a new draft so one edit is one undo step. The
// type check is the shared checker of steps.ts; saving goes through store.ts.
// Pure: no reads, no writes.
import type { RoutineArg, RoutineStep, RoutineStepType, Rule, RuleActions, RuleCondition, RuleTrigger } from '../types'
import { checkTypes, MAX_STEPS, parseSteps, readRoutine, stepError, stepKind, triggerOutput, type StepError, type StepInput } from './steps'

export interface RoutineDraft {
  name: string
  trigger: RuleTrigger
  condition: RuleCondition | null
  steps: RoutineStep[]
  /** Apply without asking ("auto" or "") and the daily AI token budget (0 = 20,000), routines-ai-step D4, D11. */
  aiApply?: string
  aiBudget?: number
}

/** Where a step sits: its list (the top level or a block of a step) and its index there. */
export interface StepPlace {
  /** The step holding the block, or '' for the top level. */
  parent: string
  block: 'then' | 'otherwise' | 'do' | ''
  index: number
}

export const NEW_ROUTINE: RoutineDraft = { name: '', trigger: { kind: 'manual' }, condition: null, steps: [] }

/** A rule as a draft: a rule without steps is one Change tasks step over the trigger (D1). */
export function draftOf(rule: Pick<Rule, 'name' | 'trigger' | 'condition' | 'actions' | 'steps'> & Partial<Pick<Rule, 'ai_apply' | 'ai_budget'>>): RoutineDraft {
  let steps: RoutineStep[] = []
  try {
    steps = readRoutine(rule.actions, rule.steps ?? null)?.steps ?? []
  } catch {
    steps = Array.isArray(rule.steps) ? rule.steps : []
  }
  return { name: rule.name, trigger: rule.trigger ?? NEW_ROUTINE.trigger, condition: rule.condition, steps, aiApply: rule.ai_apply ?? '', aiBudget: rule.ai_budget ?? 0 }
}

/**
 * The stored form of a draft (routines-engine D2): one Change tasks step over the
 * trigger keeps the rule form (`actions`, `steps: null`) so older devices keep
 * editing it; anything else is `steps` with `actions: null`.
 */
export function storedOf(d: RoutineDraft): { actions: RuleActions | null; steps: RoutineStep[] | null } {
  const [only] = d.steps
  const set = only?.in?.set
  if (d.steps.length === 1 && only.kind === 'change_tasks' && only.in?.tasks && 'ref' in only.in.tasks && only.in.tasks.ref === 'trigger'
    && set && 'literal' in set && Object.keys(only.in).length === 2 && d.trigger.kind !== 'manual') {
    return { actions: set.literal as RuleActions, steps: null }
  }
  return { actions: null, steps: d.steps }
}

/** Whether two drafts store the same routine (saving an unchanged one writes nothing). */
export function sameDraft(a: RoutineDraft, b: RoutineDraft): boolean {
  const s = (d: RoutineDraft) => JSON.stringify([d.name.trim(), d.trigger, d.condition ?? null, storedOf(d), d.aiApply ?? '', d.aiBudget ?? 0])
  return s(a) === s(b)
}

/** Every step id in use. */
function idsOf(steps: readonly RoutineStep[], out = new Set<string>()): Set<string> {
  for (const s of steps) {
    out.add(s.id)
    idsOf(s.then ?? [], out)
    idsOf(s.otherwise ?? [], out)
    idsOf(s.do ?? [], out)
  }
  return out
}

/** The number of steps, blocks included (at most MAX_STEPS). */
export const stepCount = (steps: readonly RoutineStep[]): number => idsOf(steps).size

/** A step id not in use: a … z, then a1 … */
export function newId(steps: readonly RoutineStep[], also: readonly string[] = []): string {
  const used = idsOf(steps)
  for (const x of also) used.add(x)
  for (let n = 0; ; n++) {
    for (let c = 0; c < 26; c++) {
      const id = String.fromCharCode(97 + c) + (n ? String(n) : '')
      if (!used.has(id)) return id
    }
  }
}

type Lists = { list: RoutineStep[]; place: StepPlace }

/** Visits every list of steps with where it sits. */
function lists(steps: RoutineStep[], fn: (l: Lists) => void, parent = '', block: StepPlace['block'] = ''): void {
  fn({ list: steps, place: { parent, block, index: -1 } })
  for (const s of steps) {
    if (s.then) lists(s.then, fn, s.id, 'then')
    if (s.otherwise) lists(s.otherwise, fn, s.id, 'otherwise')
    if (s.do) lists(s.do, fn, s.id, 'do')
  }
}

/** Where a step sits, or null. */
export function placeOf(steps: RoutineStep[], id: string): StepPlace | null {
  let found: StepPlace | null = null
  lists(steps, ({ list, place }) => {
    const i = list.findIndex((s) => s.id === id)
    if (i >= 0) found = { ...place, index: i }
  })
  return found
}

/** A step by id, or undefined. */
export function findStep(steps: readonly RoutineStep[], id: string): RoutineStep | undefined {
  for (const s of steps) {
    if (s.id === id) return s
    const inner = findStep(s.then ?? [], id) ?? findStep(s.otherwise ?? [], id) ?? findStep(s.do ?? [], id)
    if (inner) return inner
  }
  return undefined
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** Applies fn to a copy of the list a place names, returning the new steps. */
function editList(steps: RoutineStep[], place: Pick<StepPlace, 'parent' | 'block'>, fn: (list: RoutineStep[]) => void): RoutineStep[] {
  const next = clone(steps)
  if (!place.parent) {
    fn(next)
    return next
  }
  const holder = findStep(next, place.parent)
  if (!holder || !place.block) return next
  const block = (holder as unknown as Record<string, RoutineStep[] | undefined>)[place.block] ?? []
  fn(block)
  ;(holder as unknown as Record<string, RoutineStep[]>)[place.block] = block
  return next
}

/** A new step of a kind with its inputs filled from the step above where the type fits (D6). */
export function newStep(kind: string, id: string, above?: { id: string; type: RoutineStepType }): RoutineStep {
  const k = stepKind(kind)
  const step: RoutineStep = { id, kind }
  if (!k) return step
  const input: Record<string, RoutineArg> = {}
  if (above && above.type !== 'none') {
    const fit = k.inputs.find((d) => d.accepts.includes(above.type) && (d.required || (k.oneOf ?? []).some((set) => set[0] === d.name)))
    if (fit) input[fit.name] = { ref: above.id }
  }
  if (kind === 'change_tasks') input.set = { literal: {} }
  // Pick starts as "the first" and Get the date as today (routines-dynamic-data D2, D5).
  if (kind === 'take') { input.n = { literal: 1 }; input.from = { literal: 'start' } }
  if (kind === 'date') input.date = { literal: 'today' }
  if (kind === 'if') { step.then = []; step.otherwise = [] }
  if (kind === 'repeat') step.do = []
  if (Object.keys(input).length) step.in = input
  return step
}

/**
 * How an input takes a value of a type (routines-dynamic-data D1): as it is (a
 * Task where Tasks is accepted, a Number or Date as Text), once for each item
 * of a list where it takes one item, or not at all.
 */
export function fitOf(def: StepInput, type: RoutineStepType): 'yes' | 'each' | 'no' {
  if (def.accepts.includes(type)) return 'yes'
  if (type === 'task' && def.accepts.includes('tasks')) return 'yes'
  if ((type === 'number' || type === 'date') && def.accepts.includes('text')) return 'yes'
  const el: RoutineStepType | '' = type === 'tasks' ? 'task' : type === 'lines' ? 'text' : ''
  if (el && def.accepts.includes(el)) return 'each'
  return 'no'
}

/** A value that flows into a step: a reference and its type. */
export interface Flowing { ref: string; type: RoutineStepType }

/** The type of the list a Repeat step reads, or '' when it is not known. */
function repeatListType(d: RoutineDraft, repeatId: string, types: Record<string, RoutineStepType>): RoutineStepType | '' {
  const arg = findStep(d.steps, repeatId)?.in?.list
  if (!arg || !('ref' in arg)) return ''
  if (arg.ref === 'trigger') return triggerOutput(d.trigger.kind, !!d.condition)
  if (arg.ref === 'item') {
    const outer = enclosingRepeat(d.steps, repeatId)
    return outer ? (repeatListType(d, outer, types) === 'tasks' ? 'task' : '') : ''
  }
  return types[arg.ref] ?? ''
}

/**
 * The values that flow to a step, nearest first (routines-dynamic-data D3): the
 * enclosing Repeat's item, the outputs of earlier visible steps, then the
 * trigger's output. `types` are the outputs as checked before the step was
 * added. A manual routine's trigger (the task it is run on) is listed only
 * when `manualTrigger` is set: the editor never wires it by itself.
 */
export function flowingTo(d: RoutineDraft, id: string, types: Record<string, RoutineStepType>, manualTrigger = false): Flowing[] {
  const out: Flowing[] = []
  const rep = enclosingRepeat(d.steps, id)
  if (rep) {
    const list = repeatListType(d, rep, types)
    if (list === 'tasks' || list === 'lines') out.push({ ref: 'item', type: list === 'tasks' ? 'task' : 'text' })
  }
  for (const v of visibleBefore(d.steps, id)) {
    const type = types[v.id]
    if (type && type !== 'none') out.push({ ref: v.id, type })
  }
  if (d.trigger.kind !== 'manual' || manualTrigger) out.push({ ref: 'trigger', type: triggerOutput(d.trigger.kind, !!d.condition) })
  return out
}

/** The input a step's main value goes into: its first required input that takes references, or the first of its source set. */
export function mainInput(kind: string): StepInput | undefined {
  const k = stepKind(kind)
  return k?.inputs.find((def) => def.accepts.length > 0 && (def.required || (k.oneOf ?? []).some((set) => set[0] === def.name)))
}

/** The nearest flowing value an input of a step takes, or undefined. */
export function nearestFlowing(d: RoutineDraft, id: string, def: StepInput, types: Record<string, RoutineStepType>): Flowing | undefined {
  return flowingTo(d, id, types).find((f) => fitOf(def, f.type) !== 'no')
}

/**
 * Fills a step's empty main input with the nearest flowing value that fits
 * (routines-dynamic-data D3): the loop's item inside a Repeat, else the step
 * above or an earlier one, else the trigger. Never a task chosen by hand.
 */
export function wireStep(d: RoutineDraft, id: string, types: Record<string, RoutineStepType>): RoutineDraft {
  const step = findStep(d.steps, id)
  const def = step ? mainInput(step.kind) : undefined
  if (!step || !def || step.in?.[def.name]) return d
  const f = nearestFlowing(d, id, def, types)
  return f ? { ...d, steps: setInput(d.steps, id, def.name, { ref: f.ref }) } : d
}

/** Pick's modes (routines-dynamic-data D2): stored as `take` (first, last, N of them, all) or `filter` (where). */
export type PickMode = 'first' | 'last' | 'first_n' | 'last_n' | 'all' | 'where'
export const PICK_MODES: readonly PickMode[] = ['first', 'last', 'first_n', 'last_n', 'all', 'where']

/** The Pick mode a `take` or `filter` step is in. */
export function pickModeOf(step: Pick<RoutineStep, 'kind' | 'in'>): PickMode {
  if (step.kind === 'filter') return 'where'
  const lit = (name: string) => { const a = step.in?.[name]; return a && 'literal' in a ? a.literal : undefined }
  const from = lit('from')
  if (from === 'all') return 'all'
  const n = typeof lit('n') === 'number' ? (lit('n') as number) : 1
  const end = from === 'end'
  return n > 1 ? (end ? 'last_n' : 'first_n') : end ? 'last' : 'first'
}

/** Switches a Pick step to a mode in place, keeping its id and its list, so later steps keep reading it. */
export function setPickMode(d: RoutineDraft, id: string, mode: PickMode): RoutineDraft {
  const step = findStep(d.steps, id)
  if (!step || (step.kind !== 'take' && step.kind !== 'filter')) return d
  const list = step.in?.list
  const keep: Record<string, RoutineArg> = list ? { list } : {}
  const lit = (name: string) => { const a = step.in?.[name]; return a && 'literal' in a ? a.literal : undefined }
  const was = typeof lit('n') === 'number' && (lit('n') as number) > 1 ? (lit('n') as number) : 3
  let next: RoutineStep
  switch (mode) {
    case 'where': next = { id, kind: 'filter', in: { ...keep, where: step.kind === 'filter' && step.in?.where ? step.in.where : { literal: {} } } }; break
    case 'all': next = { id, kind: 'take', in: { ...keep, from: { literal: 'all' } } }; break
    case 'first': case 'last': next = { id, kind: 'take', in: { ...keep, n: { literal: 1 }, from: { literal: mode === 'first' ? 'start' : 'end' } } }; break
    default: next = { id, kind: 'take', in: { ...keep, n: { literal: was }, from: { literal: mode === 'first_n' ? 'start' : 'end' } } }
  }
  const replace = (steps: RoutineStep[]): RoutineStep[] => steps.map((s) => (s.id === id ? next : {
    ...s, ...(s.then ? { then: replace(s.then) } : {}), ...(s.otherwise ? { otherwise: replace(s.otherwise) } : {}), ...(s.do ? { do: replace(s.do) } : {}),
  }))
  return { ...d, steps: replace(d.steps) }
}

/** Inserts a Sort step (by due, ascending) between a Pick step and the list it reads ("Sort first"). */
export function sortBeforePick(d: RoutineDraft, id: string): RoutineDraft {
  const step = findStep(d.steps, id)
  const place = placeOf(d.steps, id)
  const list = step?.in?.list
  if (!step || !place || !list || !('ref' in list)) return d
  const sid = newId(d.steps)
  const steps = insertStep(d.steps, place, { id: sid, kind: 'sort', in: { list, by: { literal: 'due' }, direction: { literal: 'asc' } } })
  return { ...d, steps: setInput(steps, id, 'list', { ref: sid }) }
}

/** Whether a Pick step reads its list straight, without a Sort step before it ("In list order"). */
export function pickUnsorted(d: RoutineDraft, id: string): boolean {
  const list = findStep(d.steps, id)?.in?.list
  if (!list || !('ref' in list)) return false
  const from = findStep(d.steps, list.ref)
  return !from || from.kind !== 'sort'
}

/** The type of the nearest value that flows to a place, or 'start' when nothing does (Add step's suggestions). */
export function flowingTypeAt(d: RoutineDraft, place: Pick<StepPlace, 'parent' | 'block' | 'index'>, types: Record<string, RoutineStepType>): RoutineStepType | 'start' {
  const probe = '~probe'
  const f = flowingTo({ ...d, steps: insertStep(d.steps, place, { id: probe, kind: 'stop' }) }, probe, types)[0]
  return f ? f.type : 'start'
}

/** Inserts a new step of a kind at a place, wired to the data that flows there (D3). */
export function insertNewStep(d: RoutineDraft, place: Pick<StepPlace, 'parent' | 'block' | 'index'>, kind: string, id: string, types: Record<string, RoutineStepType>): RoutineDraft {
  return wireStep({ ...d, steps: insertStep(d.steps, place, newStep(kind, id)) }, id, types)
}

/** Inserts a step at a place (index: before which step; -1 at the end). */
export function insertStep(steps: RoutineStep[], place: Pick<StepPlace, 'parent' | 'block' | 'index'>, step: RoutineStep): RoutineStep[] {
  return editList(steps, place, (list) => list.splice(place.index < 0 ? list.length : place.index, 0, step))
}

export function removeStep(steps: RoutineStep[], id: string): RoutineStep[] {
  const p = placeOf(steps, id)
  return p ? editList(steps, p, (list) => list.splice(p.index, 1)) : steps
}

/** Moves a step one place up (-1) or down (+1) inside its list; null when it cannot move. */
export function moveStep(steps: RoutineStep[], id: string, delta: -1 | 1): RoutineStep[] | null {
  const p = placeOf(steps, id)
  if (!p) return null
  let moved = false
  const next = editList(steps, p, (list) => {
    const j = p.index + delta
    if (j < 0 || j >= list.length) return
    ;[list[p.index], list[j]] = [list[j], list[p.index]]
    moved = true
  })
  return moved ? next : null
}

/** A copy of a step (with new ids inside it) right after it. */
export function duplicateStep(steps: RoutineStep[], id: string): RoutineStep[] {
  const p = placeOf(steps, id)
  const s = findStep(steps, id)
  if (!p || !s) return steps
  const copy = clone(s)
  const taken: string[] = []
  const renumber = (x: RoutineStep) => {
    x.id = newId(steps, taken)
    taken.push(x.id)
    for (const b of [x.then, x.otherwise, x.do]) for (const y of b ?? []) renumber(y)
  }
  renumber(copy)
  return editList(steps, p, (list) => list.splice(p.index + 1, 0, copy))
}

/** Sets (or, with undefined, removes) one input of a step. */
export function setInput(steps: RoutineStep[], id: string, name: string, arg: RoutineArg | undefined): RoutineStep[] {
  const next = clone(steps)
  const s = findStep(next, id)
  if (!s) return steps
  const input = { ...(s.in ?? {}) }
  if (arg === undefined) delete input[name]
  else input[name] = arg
  if (Object.keys(input).length) s.in = input
  else delete s.in
  return next
}

/** The first error of a draft for the editor (D5), or null. */
export function draftError(d: RoutineDraft): StepError | null {
  if (!d.steps.length) return null
  if (stepCount(d.steps) > MAX_STEPS) return { step: '', input: '', code: 'too_many_steps', message: `a routine may hold at most ${MAX_STEPS} steps` }
  try {
    checkTypes(parseSteps(d.steps), triggerOutput(d.trigger.kind, !!d.condition))
    return null
  } catch (e) {
    return stepError(e) ?? { step: '', input: '', code: 'invalid_step', message: String(e) }
  }
}

/** Every step's output type, read as far as the draft checks (types of later steps stay unknown). */
export function draftTypes(d: RoutineDraft): Record<string, RoutineStepType> {
  try {
    return checkTypes(parseSteps(d.steps), triggerOutput(d.trigger.kind, !!d.condition))
  } catch {
    // A partial draft: type each prefix that checks.
    const out: Record<string, RoutineStepType> = {}
    for (let i = 1; i <= d.steps.length; i++) {
      try {
        Object.assign(out, checkTypes(parseSteps(d.steps.slice(0, i)), triggerOutput(d.trigger.kind, !!d.condition)))
      } catch {
        const k = stepKind(d.steps[i - 1].kind)
        if (k && !k.sameAs && !(d.steps[i - 1].id in out)) out[d.steps[i - 1].id] = k.output
      }
    }
    return out
  }
}

/** The steps visible from a step (earlier in its list and in every enclosing list), nearest first. */
export function visibleBefore(steps: RoutineStep[], id: string): { id: string; inRepeat: string }[] {
  const out: { id: string; inRepeat: string }[] = []
  const walk = (list: RoutineStep[], repeat: string): boolean => {
    const seen: string[] = []
    for (const s of list) {
      if (s.id === id) {
        out.push(...seen.reverse().map((x) => ({ id: x, inRepeat: repeat })))
        return true
      }
      for (const [b, inner] of [['then', s.then], ['otherwise', s.otherwise], ['do', s.do]] as const) {
        if (inner && walk(inner, b === 'do' ? s.id : repeat)) {
          out.push(...seen.reverse().map((x) => ({ id: x, inRepeat: repeat })))
          return true
        }
      }
      seen.push(s.id)
    }
    return false
  }
  walk(steps, '')
  return out
}

/** The Repeat step enclosing a step, or ''. */
export function enclosingRepeat(steps: RoutineStep[], id: string): string {
  let p = placeOf(steps, id)
  while (p && p.parent) {
    if (p.block === 'do') return p.parent
    p = placeOf(steps, p.parent)
  }
  return ''
}

/** The 1-based position of a step in reading order (blocks included), for "Fix step 3 first". */
export function stepNumber(steps: readonly RoutineStep[], id: string): number {
  let n = 0
  let found = 0
  const walk = (list: readonly RoutineStep[]) => {
    for (const s of list) {
      n++
      if (s.id === id) found = n
      walk(s.then ?? [])
      walk(s.otherwise ?? [])
      walk(s.do ?? [])
    }
  }
  walk(steps)
  return found
}
