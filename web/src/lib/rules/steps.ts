// Routine steps (OpenSpec change routines-engine, design D3 and D4): the step
// table, the shape check of a rule's `steps` and the type checker, the same as
// internal/ruleval/steps*.go on the server. Both run steps.vectors.json, so the
// editor shows a type error offline exactly where the API refuses the routine.
// Pure: no reads, no writes.
import type { RoutineArg, RoutineStep, RoutineStepType } from '../types'

export type StepType = RoutineStepType
type Lit = '' | 'text' | 'number' | 'date' | 'project' | 'task' | 'lines' | 'bool' | 'enum' | 'id' | 'ids' | 'actions' | 'condition' | 'compare' | 'period' | 'where'

export interface StepInput {
  name: string
  accepts: StepType[]
  literal: Lit
  enum?: string[]
  required?: boolean
  max?: number
  content?: boolean
}

export interface StepKind {
  kind: string
  group: 'tasks' | 'projects' | 'text' | 'logic' | 'time' | 'communication' | 'ai'
  inputs: StepInput[]
  output: StepType
  sameAs?: string
  oneOf?: string[][]
  content: boolean
  needs?: 'email' | 'webhook' | 'time_tracking' | 'focus' | 'shared' | 'ai'
  blocks?: string[]
  tool?: string
}

export const MAX_STEPS = 20
export const MAX_BLOCK_DEPTH = 3
export const MAX_STEPS_BYTES = 32 * 1024
export const MAX_LIST_ITEMS = 500
export const MAX_TEXT_BYTES = 64 * 1024
const MAX_LITERAL_TEXT = 20000
const MAX_IDS = 32
const MAX_ID_LEN = 64
const MAX_COMMENT = 2000
/** At most 3 AI steps per routine; an instruction of at most 2,000 characters (routines-ai-step D1). */
export const MAX_AI_STEPS = 3
export const MAX_AI_INSTRUCTION = 2000
const aiContext: StepType[] = ['text', 'lines', 'tasks', 'project']

const inp = (name: string, accepts: StepType[], literal: Lit, more: Partial<StepInput> = {}): StepInput => ({ name, accepts, literal, ...more })
const en = (name: string, values: string[], more: Partial<StepInput> = {}): StepInput => ({ name, accepts: [], literal: 'enum', enum: values, ...more })
const R = { required: true }
const C = { content: true }
const anyList: StepType[] = ['tasks', 'lines']

/** The step catalogue, grouped and ordered as the editor shows it (design D4). */
export const STEPS: StepKind[] = [
  { kind: 'find_tasks', group: 'tasks', output: 'tasks', content: false, oneOf: [['query', 'view', 'condition']],
    inputs: [inp('query', [], 'text', { ...C, max: 1000 }), inp('view', [], 'id', C), inp('condition', [], 'condition'), inp('limit', [], 'number', { max: MAX_LIST_ITEMS })] },
  { kind: 'create_tasks', group: 'tasks', output: 'tasks', content: true, tool: 'create_tasks', oneOf: [['text', 'title']],
    inputs: [inp('text', ['text', 'lines'], 'text', C), inp('title', ['text'], 'text', { ...C, max: 500 }), inp('project', ['project'], 'project'), inp('section', [], 'id'),
      inp('due', ['date'], 'date'), inp('priority', ['number'], 'number', { max: 4 }), inp('labels', [], 'ids'), en('energy', ['deep', 'medium', 'low']),
      // parent: subtasks of a task (routines-dynamic-data D5); the project comes from it.
      inp('parent', ['task'], '')] },
  { kind: 'change_tasks', group: 'tasks', output: 'tasks', content: false, tool: 'update_tasks',
    inputs: [inp('tasks', ['tasks'], '', R), inp('set', [], 'actions', R)] },
  { kind: 'add_comment', group: 'tasks', output: 'none', content: true, tool: 'add_comment',
    inputs: [inp('task', ['task'], 'task', R), inp('text', ['text'], 'text', { ...R, ...C, max: MAX_COMMENT })] },
  // get_task holds a task chosen by hand: the rare fixed target, never a default or a fix (routines-dynamic-data D4).
  { kind: 'get_task', group: 'tasks', output: 'task', content: false, inputs: [inp('task', ['task'], 'task', R)] },
  { kind: 'find_project', group: 'projects', output: 'project', content: true, inputs: [inp('name', ['text'], 'text', { ...R, ...C, max: 120 })] },
  // project_of: the project of a task; the Inbox for a task without one (routines-dynamic-data D5).
  { kind: 'project_of', group: 'projects', output: 'project', content: false, inputs: [inp('task', ['task'], '', R)] },
  { kind: 'create_project', group: 'projects', output: 'project', content: true, tool: 'create_project',
    inputs: [inp('name', ['text'], 'text', { ...R, ...C, max: 120 }), inp('parent', ['project'], 'project'), inp('color', [], 'id'), inp('icon', [], 'id')] },
  { kind: 'update_project', group: 'projects', output: 'project', content: false, tool: 'update_project',
    inputs: [inp('project', ['project'], 'project', R), inp('name', ['text'], 'text', { ...C, max: 120 }), inp('color', [], 'id'), inp('icon', [], 'id'), inp('archived', [], 'bool')] },
  { kind: 'create_sections', group: 'projects', output: 'none', content: true, tool: 'create_sections',
    inputs: [inp('project', ['project'], 'project', R), inp('names', ['lines'], 'lines', { ...R, ...C })] },
  { kind: 'create_labels', group: 'projects', output: 'none', content: true, tool: 'create_label', inputs: [inp('names', ['lines'], 'lines', { ...R, ...C })] },
  { kind: 'favourite', group: 'projects', output: 'none', content: false, tool: 'set_favourite',
    inputs: [inp('project', ['project'], 'project', R), inp('on', [], 'bool', R)] },
  { kind: 'project_from_template', group: 'projects', output: 'project', content: true,
    inputs: [inp('template', [], 'id', R), inp('start', ['date'], 'date', R), inp('name', ['text'], 'text', { ...C, max: 120 })] },
  { kind: 'note_text', group: 'text', output: 'text', content: true, inputs: [inp('of', ['task', 'project'], 'project', R)] },
  { kind: 'append_to_note', group: 'text', output: 'none', content: true, tool: 'append_to_note',
    inputs: [inp('of', ['task', 'project'], 'project', R), inp('text', ['text'], 'text', { ...R, ...C })] },
  { kind: 'clear_note', group: 'text', output: 'none', content: true, inputs: [inp('of', ['task', 'project'], 'project', R)] },
  { kind: 'split_lines', group: 'text', output: 'lines', content: true, inputs: [inp('text', ['text'], 'text', R), en('only', ['open_checkboxes'])] },
  { kind: 'join', group: 'text', output: 'text', content: true, inputs: [inp('lines', ['lines'], 'lines', R), inp('separator', [], 'text', { max: 20 })] },
  { kind: 'format', group: 'text', output: 'text', content: true, inputs: [inp('template', [], 'text', { ...R, ...C, max: 4000 })] },
  { kind: 'replace', group: 'text', output: 'text', content: true,
    inputs: [inp('text', ['text'], 'text', R), inp('find', [], 'text', { ...R, ...C, max: 500 }), inp('with', [], 'text', { ...C, max: 500 }), inp('case', [], 'bool')] },
  { kind: 'filter', group: 'logic', output: 'none', sameAs: 'list', content: false, inputs: [inp('list', anyList, '', R), inp('where', [], 'where', R)] },
  { kind: 'sort', group: 'logic', output: 'none', sameAs: 'list', content: false,
    inputs: [inp('list', anyList, '', R), en('by', ['due', 'deadline', 'priority', 'created', 'title', 'text'], R), en('direction', ['asc', 'desc'])] },
  { kind: 'take', group: 'logic', output: 'none', sameAs: 'list', content: false,
    inputs: [inp('list', anyList, '', R), inp('n', [], 'number', { max: MAX_LIST_ITEMS }), en('from', ['start', 'end', 'all'])] },
  { kind: 'count', group: 'logic', output: 'number', content: false, inputs: [inp('list', anyList, '', R)] },
  { kind: 'if', group: 'logic', output: 'none', content: false, blocks: ['then', 'otherwise'],
    inputs: [inp('value', ['number', 'text', 'date', 'tasks', 'lines', 'task', 'project'], '', R), inp('is', [], 'compare', R)] },
  { kind: 'repeat', group: 'logic', output: 'none', content: false, blocks: ['do'], inputs: [inp('list', anyList, '', R)] },
  { kind: 'stop', group: 'logic', output: 'none', content: false, inputs: [inp('reason', [], 'text', { max: 200 })] },
  // date: today, tomorrow, in N days or a date (routines-dynamic-data D5).
  { kind: 'date', group: 'time', output: 'date', content: false, inputs: [inp('date', ['date'], 'date')] },
  { kind: 'start_timer', group: 'time', output: 'none', content: false, needs: 'time_tracking', tool: 'start_timer', inputs: [inp('task', ['task'], 'task', R)] },
  { kind: 'stop_timer', group: 'time', output: 'none', content: false, needs: 'time_tracking', tool: 'stop_timer', inputs: [] },
  { kind: 'tracked_time', group: 'time', output: 'number', content: false, needs: 'time_tracking',
    inputs: [inp('period', [], 'period', R), inp('project', ['project'], 'project')] },
  { kind: 'set_focus', group: 'time', output: 'none', content: false, needs: 'focus', inputs: [inp('tasks', ['tasks'], '', R)] },
  { kind: 'notify', group: 'communication', output: 'none', content: true,
    inputs: [inp('text', ['text'], 'text', { ...R, ...C, max: 300 }), inp('task', ['task'], 'task')] },
  { kind: 'webhook', group: 'communication', output: 'none', content: false, needs: 'webhook',
    inputs: [inp('webhook_id', [], 'id', R), inp('text', ['text'], 'text', { ...C, max: MAX_LITERAL_TEXT }), inp('tasks', ['tasks'], '')] },
  { kind: 'email_me', group: 'communication', output: 'none', content: true, needs: 'email',
    inputs: [inp('subject', ['text'], 'text', { ...R, ...C, max: 120 }), inp('text', ['text'], 'text', { ...R, ...C, max: 20000 })] },
  { kind: 'ask_ai', group: 'ai', output: 'text', content: true, needs: 'ai',
    inputs: [inp('instruction', [], 'text', { ...R, ...C, max: MAX_AI_INSTRUCTION }), inp('context', aiContext, ''), inp('context2', aiContext, ''), inp('context3', aiContext, ''),
      en('answer', ['text', 'lines'])] },
  { kind: 'summarise', group: 'ai', output: 'text', content: true, needs: 'ai',
    inputs: [inp('text', ['text', 'lines', 'tasks'], '', R), en('length', ['short', 'medium'])] },
  { kind: 'email_members', group: 'communication', output: 'none', content: true, needs: 'shared',
    inputs: [inp('subject', ['text'], 'text', { ...R, ...C, max: 120 }), inp('text', ['text'], 'text', { ...R, ...C, max: 20000 })] },
]

export const stepKind = (kind: string): StepKind | undefined => STEPS.find((k) => k.kind === kind)

/** Whether a kind is an AI step (routines-ai-step D1). */
export const isAIKind = (kind: string): boolean => kind === 'ask_ai' || kind === 'summarise'

/** An Ask AI step's answer form: text (the default) or lines. */
export const aiAnswer = (s: RoutineStep): 'text' | 'lines' => (s.in?.answer && 'literal' in s.in.answer && s.in.answer.literal === 'lines' ? 'lines' : 'text')

/** The type of the reference "trigger" (design D3). */
export function triggerOutput(kind: string, hasCondition: boolean): StepType {
  if (kind === 'schedule') return hasCondition ? 'tasks' : 'date'
  return 'task'
}

export interface StepError {
  step: string
  input: string
  code: string
  message: string
}

class StepFail extends Error {
  constructor(readonly detail: StepError) { super(detail.message) }
}

const fail = (step: string, input: string, code: string, message: string): never => { throw new StepFail({ step, input, code, message }) }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const STEP_ID = /^[a-z0-9]{1,8}$/
const PLACEHOLDER = /\{([a-z0-9]{1,8})\}/g
const isCiphertext = (s: string) => s.startsWith('enc:')

/** The references a template names, in order. */
export function placeholders(template: string): string[] {
  const out: string[] = []
  for (const m of template.matchAll(PLACEHOLDER)) if (!out.includes(m[1])) out.push(m[1])
  return out
}

/** A text literal: a string, or {format: template}. */
export function textLiteral(v: unknown): { text: string; template: boolean } | null {
  if (typeof v === 'string') return { text: v, template: false }
  if (isObj(v) && Object.keys(v).length === 1 && typeof v.format === 'string') return { text: v.format, template: true }
  return null
}

const runes = (s: string) => Array.from(s).length
const utf8Bytes = (s: string) => new TextEncoder().encode(s).length

function checkText(s: string, max: number | undefined): string {
  if (isCiphertext(s)) return ''
  const limit = max || MAX_LITERAL_TEXT
  return runes(s) > limit ? `may be at most ${limit} characters` : ''
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const validDate = (s: string) => DATE.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s

/** A date literal: YYYY-MM-DD, "today", "tomorrow" or {in_days: n}. */
export function dateLiteral(v: unknown): { date?: string; word?: 'today' | 'tomorrow' | 'in_days'; inDays?: number } | null {
  if (typeof v === 'string') {
    if (v === 'today' || v === 'tomorrow') return { word: v }
    return validDate(v) ? { date: v } : null
  }
  if (isObj(v) && Object.keys(v).length === 1 && Number.isInteger(v.in_days) && Math.abs(v.in_days as number) <= 365) return { word: 'in_days', inDays: v.in_days as number }
  return null
}

const CONDITION_KEYS = ['project', 'section', 'labels', 'priority', 'due', 'deadline', 'start', 'evening', 'blocked', 'assignee', 'origin', 'habit', 'estimate', 'tracked', 'unchanged']
const ACTION_KEYS = ['add_labels', 'remove_labels', 'priority', 'due', 'start', 'state', 'section', 'deadline', 'assignee', 'comment', 'notify', 'webhook', 'energy', 'trash']
const COMPARE_OPS = ['>', '>=', '=', '!=', '<=', '<', 'empty', 'not_empty', 'contains']
const PERIODS = ['today', 'this_week', 'last_week', 'this_month']
const idOk = (s: unknown) => typeof s === 'string' && s.length > 0 && s.length <= MAX_ID_LEN

/** The literal's problem, or '' (the server's ruleval checks conditions and actions in full). */
function checkLiteral(def: StepInput, v: unknown): string {
  switch (def.literal) {
    case 'text': {
      const t = textLiteral(v)
      return t ? checkText(t.text, def.max) : 'must be text or {"format": text}'
    }
    case 'number':
      if (typeof v !== 'number' || !Number.isFinite(v)) return 'must be a number'
      return def.max && (v < 0 || v > def.max) ? `must be from 0 to ${def.max}` : ''
    case 'date':
      return dateLiteral(v) ? '' : 'must be YYYY-MM-DD, "today", "tomorrow" or {"in_days": n}'
    case 'project':
    case 'task':
      return isObj(v) && Object.keys(v).length === 1 && idOk(v[def.literal]) ? '' : `must be {"${def.literal}": id}`
    case 'lines':
      if (!Array.isArray(v) || v.length > MAX_LIST_ITEMS || !v.every((s) => typeof s === 'string')) return `must be a list of at most ${MAX_LIST_ITEMS} texts`
      return v.map((s: string) => checkText(s, 1000)).find(Boolean) ?? ''
    case 'bool':
      return typeof v === 'boolean' ? '' : 'must be true or false'
    case 'enum':
      return typeof v === 'string' && def.enum!.includes(v) ? '' : `must be one of ${def.enum!.join(', ')}`
    case 'id':
      return idOk(v) ? '' : 'must be an id'
    case 'ids':
      return Array.isArray(v) && v.length <= MAX_IDS && v.every(idOk) ? '' : `must be a list of at most ${MAX_IDS} ids`
    case 'actions':
      return isObj(v) && Object.keys(v).length > 0 && Object.keys(v).every((k) => ACTION_KEYS.includes(k)) ? '' : 'set must hold at least one known change'
    case 'condition':
      return isObj(v) && Object.keys(v).every((k) => CONDITION_KEYS.includes(k)) ? '' : 'not a condition'
    case 'compare': {
      if (!isObj(v) || Object.keys(v).length !== 1) return 'is must be one test'
      const [op, x] = Object.entries(v)[0]
      if (!COMPARE_OPS.includes(op)) return 'is must be one test'
      if (op === 'empty' || op === 'not_empty') return x === true ? '' : `is.${op} must be true`
      if (op === 'contains') return typeof x === 'string' && x && !checkText(x, 500) ? '' : 'is.contains must be a text'
      return (typeof x === 'number' && Number.isFinite(x)) || (typeof x === 'string' && !checkText(x, 500)) ? '' : `is.${op} must be a number, a date or a text`
    }
    case 'period':
      if (typeof v === 'string') return PERIODS.includes(v) ? '' : 'not a period'
      return isObj(v) && Object.keys(v).length === 2 && validDate(v.from as string) && validDate(v.to as string) && (v.from as string) <= (v.to as string) ? '' : 'not a period'
    case 'where': {
      if (!isObj(v)) return 'where must be an object'
      const keys = Object.keys(v)
      if (keys.length === 1 && (keys[0] === 'contains' || keys[0] === 'not_contains')) return typeof v[keys[0]] === 'string' && v[keys[0]] ? '' : 'where needs a text'
      return keys.every((k) => CONDITION_KEYS.includes(k)) ? '' : 'not a condition'
    }
  }
  return ''
}

function parseArg(k: StepKind, def: StepInput, id: string, v: unknown): RoutineArg {
  if (!isObj(v) || Object.keys(v).length !== 1) return fail(id, def.name, 'invalid_step', `${k.kind}.${def.name} must be {ref} or {literal}`)
  if ('ref' in v) {
    if (typeof v.ref !== 'string' || !v.ref) return fail(id, def.name, 'invalid_step', `${k.kind}.${def.name}: ref must name a step`)
    if (!def.accepts.length) return fail(id, def.name, 'invalid_step', `${k.kind}.${def.name} takes a literal value only`)
    return { ref: v.ref }
  }
  if (!('literal' in v)) return fail(id, def.name, 'invalid_step', `${k.kind}.${def.name} must be {ref} or {literal}`)
  if (!def.literal) return fail(id, def.name, 'invalid_step', `${k.kind}.${def.name} takes a reference only`)
  const msg = checkLiteral(def, v.literal)
  if (msg) fail(id, def.name, 'invalid_literal', `${k.kind}.${def.name}: ${msg}`)
  return { literal: v.literal }
}

function parseList(raw: unknown, depth: number, st: { ids: Set<string>; count: number; ai: number }): RoutineStep[] {
  if (!Array.isArray(raw)) return fail('', '', 'invalid_step', 'steps must be a list')
  return raw.map((item) => parseStep(item, depth, st))
}

function parseStep(raw: unknown, depth: number, st: { ids: Set<string>; count: number; ai: number }): RoutineStep {
  if (!isObj(raw)) return fail('', '', 'invalid_step', 'every step must be an object')
  if (++st.count > MAX_STEPS) fail('', '', 'too_many_steps', `a routine may hold at most ${MAX_STEPS} steps`)
  const id = typeof raw.id === 'string' ? raw.id : ''
  if (!STEP_ID.test(id) || id === 'trigger' || id === 'item') fail(id, '', 'invalid_step', 'a step id must be 1 to 8 characters a-z and 0-9 (trigger and item are reserved)')
  if (st.ids.has(id)) fail(id, '', 'duplicate_id', `step id "${id}" is used twice`)
  st.ids.add(id)
  const kind = typeof raw.kind === 'string' ? raw.kind : ''
  const k = stepKind(kind) ?? fail(id, '', 'unknown_kind', `step ${id}: unknown kind "${kind}"`)
  if (isAIKind(kind) && ++st.ai > MAX_AI_STEPS) fail(id, '', 'too_many_ai_steps', `a routine may hold at most ${MAX_AI_STEPS} AI steps`)
  const allowed = ['id', 'kind', 'in', ...(k.blocks ?? [])]
  for (const key of Object.keys(raw)) if (!allowed.includes(key)) fail(id, '', 'invalid_step', `step ${id} (${kind}) does not allow "${key}"`)
  const inputs = parseInputs(k, id, raw.in)
  const step: RoutineStep = Object.keys(inputs).length ? { id, kind, in: inputs } : { id, kind }
  for (const b of k.blocks ?? []) {
    if (raw[b] === undefined || raw[b] === null) continue
    if (depth + 1 > MAX_BLOCK_DEPTH) fail(id, '', 'too_deep', `blocks may nest at most ${MAX_BLOCK_DEPTH} deep`)
    ;(step as unknown as Record<string, RoutineStep[]>)[b] = parseList(raw[b], depth + 1, st)
  }
  return step
}

function parseInputs(k: StepKind, id: string, raw: unknown): Record<string, RoutineArg> {
  const out: Record<string, RoutineArg> = {}
  if (raw !== undefined && raw !== null) {
    if (!isObj(raw)) fail(id, '', 'invalid_step', `step ${id}: in must be an object`)
    const m = raw as Record<string, unknown>
    for (const name of Object.keys(m).sort()) if (!k.inputs.some((d) => d.name === name)) fail(id, name, 'unknown_input', `${k.kind}: unknown input "${name}"`)
    for (const def of k.inputs) if (def.name in m) out[def.name] = parseArg(k, def, id, m[def.name])
  }
  for (const def of k.inputs) if (def.required && !(def.name in out)) fail(id, def.name, 'missing_input', `${k.kind}: ${def.name} is required`)
  // Subtasks take their parent's project (routines-dynamic-data D5).
  if (k.kind === 'create_tasks' && 'parent' in out && 'project' in out) {
    fail(id, 'project', 'invalid_step', "create_tasks: subtasks take the parent's project; give parent or project, not both")
  }
  for (const set of k.oneOf ?? []) {
    if (set.filter((n) => n in out).length !== 1) fail(id, set[0], 'missing_input', `${k.kind}: give exactly one of ${set.join(', ')}`)
  }
  return out
}

const inputNames = (s: RoutineStep): string[] => (stepKind(s.kind)?.inputs ?? []).map((d) => d.name).filter((n) => s.in && n in s.in)

function templateText(s: RoutineStep, name: string, a: RoutineArg): string | null {
  if ('ref' in a) return null
  const t = textLiteral(a.literal)
  if (!t || !(t.template || (s.kind === 'format' && name === 'template')) || isCiphertext(t.text)) return null
  return t.text
}

function checkRefs(list: RoutineStep[], visible: Set<string>, inRepeat: boolean): void {
  const vis = new Set(visible)
  const ok = (ref: string) => ref === 'trigger' || (ref === 'item' && inRepeat) || vis.has(ref)
  for (const s of list) {
    for (const name of inputNames(s)) {
      const a = s.in![name]
      const refs = 'ref' in a ? [a.ref] : placeholders(templateText(s, name, a) ?? '')
      for (const ref of refs) if (!ok(ref)) fail(s.id, name, 'unknown_ref', `${s.kind}.${name}: "${ref}" is not an earlier step`)
    }
    checkRefs(s.then ?? [], vis, inRepeat)
    checkRefs(s.otherwise ?? [], vis, inRepeat)
    checkRefs(s.do ?? [], vis, true)
    vis.add(s.id)
  }
}

/** Decodes and checks a `steps` value (the sync shape check). Throws a StepError-carrying error. */
export function parseSteps(raw: unknown): RoutineStep[] {
  if (utf8Bytes(JSON.stringify(raw)) > MAX_STEPS_BYTES) fail('', '', 'too_large', `steps may be at most ${MAX_STEPS_BYTES / 1024} KB`)
  const steps = parseList(raw, 0, { ids: new Set(), count: 0, ai: 0 })
  if (!steps.length) fail('', '', 'invalid_step', 'a routine needs at least one step')
  checkRefs(steps, new Set(), false)
  return steps
}

const TYPE_NAMES: Record<StepType, string> = { text: 'Text', task: 'Task', tasks: 'Tasks', project: 'Project', date: 'Date', number: 'Number', lines: 'Lines', none: 'no output' }
export const typeName = (t: StepType): string => TYPE_NAMES[t] ?? t
const elementOf = (t: StepType | undefined): StepType | '' => (t === 'tasks' ? 'task' : t === 'lines' ? 'text' : '')
const listOfType = (t: StepType): StepType | '' => (t === 'task' || t === 'tasks' ? 'tasks' : t === 'text' || t === 'lines' ? 'lines' : t === 'none' ? 'none' : '')

function accepts(def: StepInput, t: StepType): StepType | '' {
  if (def.accepts.includes(t)) return t
  if (t === 'task' && def.accepts.includes('tasks')) return 'tasks'
  if ((t === 'number' || t === 'date') && def.accepts.includes('text')) return 'text'
  return ''
}

/** Type-checks parsed steps; returns every step's output type. Throws a StepError-carrying error. */
export function checkTypes(steps: RoutineStep[], trigger: StepType): Record<string, StepType> {
  const types: Record<string, StepType> = {}
  const refType = (ref: string, env: Map<string, StepType>, item: StepType | ''): StepType | '' =>
    ref === 'trigger' ? trigger : ref === 'item' ? item : env.get(ref) ?? ''
  const list = (xs: RoutineStep[], outer: Map<string, StepType>, item: StepType | '') => {
    const env = new Map(outer)
    for (const s of xs) {
      const out = step(s, env, item)
      env.set(s.id, out)
      types[s.id] = out
    }
  }
  const step = (s: RoutineStep, env: Map<string, StepType>, item: StepType | ''): StepType => {
    const k = stepKind(s.kind)!
    let eachRef = ''
    let same: StepType | '' = ''
    for (const name of inputNames(s)) {
      const a = s.in![name]
      const def = k.inputs.find((d) => d.name === name)!
      if (!('ref' in a)) {
        for (const ref of placeholders(templateText(s, name, a) ?? '')) {
          const t = refType(ref, env, item)
          if (!t || t === 'none') fail(s.id, name, 'no_output', `${s.kind}.${name}: ${ref} has no output`)
        }
        continue
      }
      const t = refType(a.ref, env, item)
      if (!t || t === 'none') fail(s.id, name, 'no_output', `${s.kind}.${name}: ${a.ref} has no output`)
      let got = accepts(def, t as StepType)
      if (!got) {
        const el = elementOf(t as StepType)
        if (!el || !accepts(def, el)) fail(s.id, name, 'type_mismatch', `${s.kind}: ${name} expects ${def.accepts.map(typeName).join(' or ')}, got ${typeName(t as StepType)}`)
        if (eachRef && eachRef !== a.ref) fail(s.id, name, 'for_each', `${s.kind}: only one input can take a list for each of its items; use Repeat for each`)
        eachRef = a.ref
        got = el as StepType
      }
      if (name === k.sameAs) same = got
    }
    let out: StepType | '' = k.sameAs ? same : k.output
    if (s.kind === 'ask_ai' && aiAnswer(s) === 'lines') out = 'lines'
    if (eachRef) {
      out = listOfType(out as StepType)
      if (!out) fail(s.id, '', 'for_each', `${s.kind}: cannot run once per item here; use Repeat for each`)
    }
    if (s.kind === 'if') {
      list(s.then ?? [], env, item)
      list(s.otherwise ?? [], env, item)
    } else if (s.kind === 'repeat') {
      const ref = (s.in!.list as { ref: string }).ref
      list(s.do ?? [], env, elementOf(refType(ref, env, item) as StepType))
      out = 'none'
      const last = s.do?.[s.do.length - 1]
      if (last) out = listOfType(types[last.id]) || 'none'
    }
    return out as StepType
  }
  list(steps, new Map(), '')
  return types
}

/** Calls fn for every step, depth first in order. */
export function walkSteps(list: RoutineStep[], fn: (s: RoutineStep) => void): void {
  for (const s of list) {
    fn(s)
    walkSteps(s.then ?? [], fn)
    walkSteps(s.otherwise ?? [], fn)
    walkSteps(s.do ?? [], fn)
  }
}

const literalOf = (s: RoutineStep, name: string): unknown => (s.in && name in s.in && 'literal' in s.in[name] ? (s.in[name] as { literal: unknown }).literal : undefined)

/** The first step that reads or writes user-written text (design D9), or ''. */
export function contentStep(steps: RoutineStep[], trigger: StepType, types: Record<string, StepType>): string {
  let found = ''
  walkSteps(steps, (s) => {
    if (found) return
    const has = (n: string) => !!s.in && n in s.in
    let c: boolean
    switch (s.kind) {
      case 'find_tasks': c = has('query') || has('view'); break
      case 'change_tasks': c = isObj(literalOf(s, 'set')) && 'comment' in (literalOf(s, 'set') as object); break
      case 'update_project': c = has('name'); break
      case 'filter': {
        const w = literalOf(s, 'where') as Record<string, unknown>
        const keys = Object.keys(w ?? {})
        c = keys.length === 1 && (keys[0] === 'contains' || keys[0] === 'not_contains')
        break
      }
      case 'sort': c = literalOf(s, 'by') === 'title' || literalOf(s, 'by') === 'text'; break
      case 'if': {
        const ref = (s.in!.value as { ref: string }).ref
        const vt = ref === 'trigger' ? trigger : types[ref]
        c = 'contains' in ((literalOf(s, 'is') as object) ?? {}) || vt === 'text'
        break
      }
      case 'webhook': c = has('text'); break
      default: c = stepKind(s.kind)?.content ?? false
    }
    if (c) found = s.id
  })
  return found
}

/** At most this many items are written by a run without asking (routines-ai-step D4). */
export const MAX_AUTO_ITEMS = 20

const AUTO_KINDS: Record<string, string> = {
  create_project: 'projects', update_project: 'projects', create_sections: 'projects', favourite: 'projects', project_from_template: 'projects',
  append_to_note: 'notes', clear_note: 'notes', set_focus: 'focus', start_timer: 'timers', stop_timer: 'timers', email_members: 'email_members',
}

/**
 * The first step a routine may not hold while it applies AI results without
 * asking, and what it does (routines-ai-step D4); null when every step is
 * allowed. The same check as internal/ruleval/auto.go (the "auto" vectors).
 */
export function autoBlocker(steps: RoutineStep[]): { step: string; what: string } | null {
  let out: { step: string; what: string } | null = null
  walkSteps(steps, (s) => {
    if (out) return
    if (AUTO_KINDS[s.kind]) { out = { step: s.id, what: AUTO_KINDS[s.kind] }; return }
    if (s.kind !== 'change_tasks') return
    const set = literalOf(s, 'set')
    if (!isObj(set)) return
    if ('state' in set) out = { step: s.id, what: 'complete_tasks' }
    else if (set.trash === true) out = { step: s.id, what: 'trash_tasks' }
    else if (Array.isArray(set.remove_labels) && set.remove_labels.length) out = { step: s.id, what: 'remove_labels' }
    else if ('assignee' in set) out = { step: s.id, what: 'assign' }
  })
  return out
}

/** Whether a routine holds an AI step. */
export function hasAI(steps: RoutineStep[]): boolean {
  let found = false
  walkSteps(steps, (s) => { found ||= isAIKind(s.kind) })
  return found
}

/** The error a failed check carries, or null. */
export function stepError(e: unknown): StepError | null {
  return e instanceof StepFail ? e.detail : null
}

/**
 * The reading of a rule's stored fields as steps (design D2): `steps` null is
 * one Change tasks step over the trigger's output with the actions (legacy).
 */
export function readRoutine(actions: unknown, steps: unknown): { steps: RoutineStep[]; legacy: boolean } | null {
  if (steps !== null && steps !== undefined) return { steps: parseSteps(steps), legacy: false }
  if (!isObj(actions) || !Object.keys(actions).length) return null
  return { steps: [{ id: 'a', kind: 'change_tasks', in: { tasks: { ref: 'trigger' }, set: { literal: actions } } }], legacy: true }
}
