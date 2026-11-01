// The routine editor's draft (OpenSpec change routines-editor, design D1, D2,
// D5 and D6): a routine being edited as plain data, and the edits the editor
// makes to it, each returning a new draft so one edit is one undo step. The
// type check is the shared checker of steps.ts; saving goes through store.ts.
// Pure: no reads, no writes.
import type { RoutineArg, RoutineStep, RoutineStepType, Rule, RuleActions, RuleCondition, RuleTrigger } from '../types'
import { checkTypes, MAX_STEPS, parseSteps, readRoutine, stepError, stepKind, triggerOutput, type StepError } from './steps'

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
  if (kind === 'if') { step.then = []; step.otherwise = [] }
  if (kind === 'repeat') step.do = []
  if (Object.keys(input).length) step.in = input
  return step
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
