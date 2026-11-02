// One-tap fixes for type errors (OpenSpec change routines-editor, design D5):
// a fixed table from the shared checker's error to one edit of the draft. A fix
// either changes the steps (insert a conversion, wrap in Repeat) or asks the
// editor to open the word's picker ("Choose another value"). A fix wires the
// data that flows into the step and never inserts a task chosen by hand
// (routines-dynamic-data D3). Pure.
import { t } from '../i18n'
import type { RoutineStep, RoutineStepType } from '../types'
import { findStep, insertStep, nearestFlowing, newId, placeOf, removeStep, setInput, type RoutineDraft } from './draft'
import { stepName, typeLabel } from './sentence'
import { stepKind, type StepError } from './steps'

export type Fix =
  | { kind: 'edit'; label: string; apply: (d: RoutineDraft) => RoutineDraft }
  | { kind: 'choose'; label: string; step: string; input: string }

/** The type an input got, read from the checker's message ("got Tasks"). */
function gotType(e: StepError): RoutineStepType | null {
  const m = /got (\w+)/.exec(e.message)
  if (!m) return null
  const map: Record<string, RoutineStepType> = { Text: 'text', Task: 'task', Tasks: 'tasks', Project: 'project', Date: 'date', Number: 'number', Lines: 'lines' }
  return map[m[1]] ?? null
}

/** Inserts a conversion step before `id`, reading what the input read, and points the input at it. */
function convert(kind: string, from: string, id: string, input: string, inputName: string, literal?: Record<string, unknown>) {
  return (d: RoutineDraft): RoutineDraft => {
    const place = placeOf(d.steps, id)
    if (!place) return d
    const cid = newId(d.steps)
    const step: RoutineStep = { id: cid, kind, in: { [inputName]: { ref: from }, ...Object.fromEntries(Object.entries(literal ?? {}).map(([k, v]) => [k, { literal: v }])) } }
    let steps = insertStep(d.steps, place, step)
    steps = setInput(steps, id, input, { ref: cid })
    return { ...d, steps }
  }
}

/** Format text over a reference: the tasks' titles, one per line. */
function formatOf(from: string, id: string, input: string) {
  return (d: RoutineDraft): RoutineDraft => {
    const place = placeOf(d.steps, id)
    if (!place) return d
    const cid = newId(d.steps)
    let steps = insertStep(d.steps, place, { id: cid, kind: 'format', in: { template: { literal: `{${from}}` } } })
    steps = setInput(steps, id, input, { ref: cid })
    return { ...d, steps }
  }
}

/** Wraps a step in Repeat for each over the list it read, reading `item` instead. */
function wrapInRepeat(from: string, id: string, input: string) {
  return (d: RoutineDraft): RoutineDraft => {
    const place = placeOf(d.steps, id)
    const step = findStep(d.steps, id)
    if (!place || !step) return d
    const rid = newId(d.steps)
    const inner = setInput([step], id, input, { ref: 'item' })[0]
    const steps = insertStep(removeStep(d.steps, id), place, { id: rid, kind: 'repeat', in: { list: { ref: from } }, do: [inner] })
    return { ...d, steps }
  }
}

/** Inserts Find tasks above a step and points its input at the found tasks. */
function findTasksAbove(id: string, input: string) {
  return (d: RoutineDraft): RoutineDraft => {
    const place = placeOf(d.steps, id)
    if (!place) return d
    const fid = newId(d.steps)
    const steps = insertStep(d.steps, place, { id: fid, kind: 'find_tasks', in: { condition: { literal: {} } } })
    return { ...d, steps: setInput(steps, id, input, { ref: fid }) }
  }
}

/** What a fix needs to wire flowing data: the outputs' types (as checked) and their names. */
export interface FlowContext {
  types: Record<string, RoutineStepType>
  name: (ref: string) => string
}

/** The fix for an empty input or a removed reference: the nearest flowing value, else Find tasks for a task input. */
function wireFix(d: RoutineDraft, e: StepError, step: RoutineStep, flow: FlowContext): Fix | null {
  const def = stepKind(step.kind)?.inputs.find((x) => x.name === e.input)
  if (!def || !def.accepts.length) return null
  const f = nearestFlowing(d, step.id, def, flow.types)
  if (f) {
    return { kind: 'edit', label: t('Use {name}', { name: flow.name(f.ref) }), apply: (x) => ({ ...x, steps: setInput(x.steps, step.id, def.name, { ref: f.ref }) }) }
  }
  if (def.accepts.includes('task') || def.accepts.includes('tasks')) return { kind: 'edit', label: t('Find tasks…'), apply: findTasksAbove(step.id, def.name) }
  return null
}

/** The fix for an error, or null when the table has none. With `flow`, an empty input is wired to the data that flows there. */
export function fixFor(d: RoutineDraft, e: StepError, flow?: FlowContext): Fix | null {
  const step = findStep(d.steps, e.step)
  if (!step || !e.input) return null
  const arg = step.in?.[e.input]
  const from = arg && 'ref' in arg ? arg.ref : ''
  if (flow && (e.code === 'missing_input' || e.code === 'unknown_ref')) {
    const w = wireFix(d, e, step, flow)
    if (w) return w
  }
  if (e.code === 'unknown_ref' || e.code === 'missing_input' || e.code === 'no_output' || e.code === 'invalid_literal') {
    return { kind: 'choose', label: e.code === 'missing_input' ? t('Choose a value') : t('Choose another value'), step: e.step, input: e.input }
  }
  if (!from) return null
  if (e.code === 'for_each') return { kind: 'edit', label: t('Wrap in {step}', { step: stepName('repeat') }), apply: wrapInRepeat(from, e.step, e.input) }
  if (e.code !== 'type_mismatch') return null
  const def = stepKind(step.kind)?.inputs.find((x) => x.name === e.input)
  const got = gotType(e)
  if (!def || !got) return null
  const wants = (x: RoutineStepType) => def.accepts.includes(x)
  const insert = (kind: string) => t('Insert {step}', { step: stepName(kind) })
  if (got === 'tasks' && wants('text')) return { kind: 'edit', label: insert('format'), apply: formatOf(from, e.step, e.input) }
  if ((got === 'tasks' || got === 'lines') && wants('number')) return { kind: 'edit', label: insert('count'), apply: convert('count', from, e.step, e.input, 'list') }
  if (got === 'lines' && wants('text')) return { kind: 'edit', label: insert('join'), apply: convert('join', from, e.step, e.input, 'lines') }
  if (got === 'text' && wants('lines')) return { kind: 'edit', label: insert('split_lines'), apply: convert('split_lines', from, e.step, e.input, 'text') }
  return null
}

/** The error as the card shows it ("Notify me expects Text, got Tasks"). */
export function errorText(d: RoutineDraft, e: StepError, names: Map<string, string>): string {
  const step = findStep(d.steps, e.step)
  const name = step ? stepName(step.kind) : ''
  const arg = step?.in?.[e.input]
  const ref = arg && 'ref' in arg ? arg.ref : ''
  switch (e.code) {
    case 'type_mismatch': {
      const def = stepKind(step?.kind ?? '')?.inputs.find((x) => x.name === e.input)
      const got = gotType(e)
      if (def && got) return t('{step} expects {want}, got {got}', { step: name, want: def.accepts.map(typeLabel).join(' / '), got: typeLabel(got) })
      break
    }
    case 'unknown_ref': return t('{name} no longer exists', { name: names.get(ref) ?? t('the value') })
    case 'missing_input': return t('{step} needs a value here', { step: name })
    case 'for_each': return t('{step} can take only one item here', { step: name })
    case 'too_many_steps': return t('A routine can have at most 20 steps')
    case 'too_deep': return t('Blocks can be nested at most 3 deep')
  }
  return e.message
}
