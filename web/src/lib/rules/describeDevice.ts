// Describe it on this device (OpenSpec change routines-describe-it, design D5):
// for an encrypted account the same draft turn as the server's
// (internal/assistant/routinedraft.go), built from the manifest the server
// generates, runs through the on-device assistant with this device's provider
// and key and the decrypted names; the draft is checked with the shared
// TypeScript checker and the errors go back to the model once. Nothing reaches
// the OpenTodo server, and nothing is saved: the editor opens the draft.
// web/src/lib/assistantDevice/routineDraft.vectors.json pins the request and
// the reading of the answer to the server's.
import { manifest } from '../assistantDevice/manifest'
import { getDeviceSetup } from '../assistantDevice/settings'
import { RULE_TRIGGERS } from '../types'
import type { Catalogue } from './catalogue'
import { isAvailable } from './catalogue'
import { draftError } from './draft'
import type { DraftAnswer, DraftedRoutine, DraftNames, DraftProblem } from './describe'
import { STEPS } from './steps'
import type { RoutineStep, RuleTrigger } from '../types'

const D = manifest.routine_draft

/** A draft call takes at most 120 seconds (two model calls of 60). */
export const DRAFT_CALL_MS = 120_000

/** Whether a kind is ever offered to a draft: never Get a specific task. */
export const draftOffered = (kind: string): boolean => kind !== 'get_task'

/** The system text offering `kinds` (DraftSystemFor). */
export function draftSystemFor(kinds: readonly string[]): string {
  const want = new Set(kinds)
  let out = D.system + '\n\nSteps you can use:'
  for (const k of D.order) if (want.has(k) && D.step_lines[k]) out += '\n' + D.step_lines[k]
  return out
}

const cap = (l: DraftNames[keyof DraftNames] | undefined) => (l ?? []).slice(0, D.limits.max_names).map((n) => (n.project ? { id: n.id, name: n.name, project: n.project } : { id: n.id, name: n.name }))

/** The user message: the sentence, then the names as untrusted text (DraftMessage). */
export function draftMessage(text: string, names: DraftNames): string {
  const env = { untrusted_text: { projects: cap(names.projects), sections: cap(names.sections), labels: cap(names.labels), views: cap(names.views), webhooks: cap(names.webhooks) } }
  return text.trim() + '\n\n' + D.context_note + '\n' + JSON.stringify(env)
}

/** JSON text as a value: '' and 'null' read as null; undefined when it is not JSON. */
function jsonValue(text: string): { value: unknown } | undefined {
  const s = text.trim()
  if (s === '' || s === 'null') return { value: null }
  try {
    return { value: JSON.parse(s) }
  } catch {
    return undefined
  }
}

/** Cuts text to at most n UTF-8 bytes on a character boundary. */
function cutBytes(s: string, n: number): string {
  const enc = new TextEncoder()
  if (enc.encode(s).length <= n) return s
  let out = ''
  let used = 0
  for (const ch of s) {
    const b = enc.encode(ch).length
    if (used + b > n) break
    out += ch
    used += b
  }
  return out
}

type RawStep = { id?: unknown; kind?: unknown; in?: Record<string, unknown>; then?: unknown; otherwise?: unknown; do?: unknown }

/** The steps holding a task chosen by hand (HandPicked): Get a specific task, or a {"task": id} literal. */
export function handPicked(steps: unknown): DraftProblem[] {
  const out: DraftProblem[] = []
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return
    for (const raw of list as RawStep[]) {
      if (!raw || typeof raw !== 'object') continue
      const id = typeof raw.id === 'string' ? raw.id : ''
      const kind = typeof raw.kind === 'string' ? raw.kind : ''
      if (!draftOffered(kind)) {
        out.push({ step: id, code: 'hand_picked', message: `step ${id}: ${kind} holds a task chosen by hand; read tasks from the trigger, find_tasks, take or repeat` })
        continue
      }
      const inputs = raw.in && typeof raw.in === 'object' ? raw.in : {}
      for (const name of Object.keys(inputs).sort()) {
        const lit = (inputs[name] as { literal?: unknown } | null)?.literal
        if (lit && typeof lit === 'object' && !Array.isArray(lit) && 'task' in lit) {
          out.push({ step: id, input: name, code: 'hand_picked', message: `step ${id}: ${kind}.${name} holds a task chosen by hand ({"task": id}); use a reference instead` })
        }
      }
      for (const b of [raw.then, raw.otherwise, raw.do]) if (b !== undefined && b !== null) walk(b)
    }
  }
  walk(steps)
  return out
}

/** The tool's arguments as a draft (ReadDraft): the draft (null when a field is not JSON), its note and its problems. */
export function readDraft(args: unknown): { draft: DraftedRoutine | null; note: string; problems: DraftProblem[] } {
  const a = (args && typeof args === 'object' && !Array.isArray(args) ? args : null) as Record<string, unknown> | null
  const field = (k: string) => (typeof a?.[k] === 'string' ? (a[k] as string) : a?.[k] === undefined || a?.[k] === null ? '' : null)
  const fields = ['name', 'trigger', 'condition', 'steps', 'note'].map(field)
  if (!a || fields.some((f) => f === null)) {
    return { draft: null, note: '', problems: [{ code: 'invalid_draft', message: 'the arguments must be an object of texts: name, trigger, condition, steps, note' }] }
  }
  const [name, trigger, condition, steps, note] = fields as string[]
  const out = { note: cutBytes(note.trim(), 500), problems: [] as DraftProblem[] }
  const bad = (f: string) => out.problems.push({ code: 'invalid_draft', message: `${f} must be JSON text` })
  const tr = jsonValue(trigger)
  if (!tr || tr.value === null) bad('trigger')
  const cond = jsonValue(condition)
  if (!cond) bad('condition')
  const st = jsonValue(steps)
  if (!st || st.value === null) bad('steps')
  if (out.problems.length) return { draft: null, ...out }
  const draft: DraftedRoutine = {
    name: [...name.trim()].slice(0, 200).join(''),
    trigger: tr!.value as RuleTrigger, condition: cond!.value as DraftedRoutine['condition'], steps: st!.value as RoutineStep[],
  }
  return { draft, ...out, problems: handPicked(draft.steps) }
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

/** A trigger's shape problem, '' when it checks (ParseTrigger). */
function triggerProblem(t: unknown, has: (kind: 'labels' | 'projects' | 'sections', id: unknown) => boolean): string {
  const tr = t as Partial<RuleTrigger> & Record<string, unknown>
  if (!tr || typeof tr !== 'object' || !RULE_TRIGGERS.includes(tr.kind as RuleTrigger['kind'])) return `trigger.kind must be one of ${RULE_TRIGGERS.join(', ')}`
  const allowed: Record<string, string[]> = { 'label.added': ['kind', 'label_id'], 'label.removed': ['kind', 'label_id'], 'task.moved': ['kind', 'project_id', 'section_id'], schedule: ['kind', 'at', 'weekdays', 'month_days'] }
  const keys = allowed[tr.kind as string] ?? ['kind']
  const extra = Object.keys(tr).find((k) => !keys.includes(k))
  if (extra) return `trigger ${tr.kind}: unknown field ${extra}`
  if ((tr.kind === 'label.added' || tr.kind === 'label.removed') && !has('labels', tr.label_id)) return 'trigger.label_id: no such label'
  if (tr.kind === 'task.moved' && (!has('projects', tr.project_id) || (tr.section_id != null && !has('sections', tr.section_id)))) return 'trigger.project_id: no such project or section'
  if (tr.kind === 'schedule') {
    if (typeof tr.at !== 'string' || !HHMM.test(tr.at)) return 'trigger.at must be a time HH:MM'
    const wd = Array.isArray(tr.weekdays)
    const md = Array.isArray(tr.month_days)
    if (wd === md) return 'trigger.schedule takes exactly one of weekdays and month_days'
    if (wd && (!tr.weekdays!.length || !tr.weekdays!.every((d) => Number.isInteger(d) && d >= 1 && d <= 7))) return 'trigger.weekdays must list days 1 to 7'
    if (md && (!tr.month_days!.length || !tr.month_days!.every((d) => d === 'last' || (Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 31)))) return 'trigger.month_days must list days 1 to 31 or "last"'
  }
  return ''
}

/** The ids a condition and the steps' literals name, by kind of container. */
function namedIds(d: DraftedRoutine): { kind: 'projects' | 'sections' | 'labels' | 'views' | 'webhooks'; id: unknown; step?: string; input?: string }[] {
  const out: ReturnType<typeof namedIds> = []
  const c = (d.condition ?? {}) as Record<string, unknown>
  const pr = c.project as { in?: unknown[] } | undefined
  if (pr && typeof pr === 'object') for (const id of pr.in ?? []) out.push({ kind: 'projects', id })
  const se = c.section as { in?: unknown[] } | undefined
  if (se && typeof se === 'object') for (const id of se.in ?? []) out.push({ kind: 'sections', id })
  const lb = c.labels as Record<string, unknown[]> | undefined
  if (lb && typeof lb === 'object') for (const k of ['any', 'all', 'none']) for (const id of lb[k] ?? []) out.push({ kind: 'labels', id })
  const walk = (list: RoutineStep[]) => {
    for (const s of list) {
      const lit = (name: string): unknown => { const a = s.in?.[name]; return a && 'literal' in a ? a.literal : undefined }
      for (const name of ['project', 'parent', 'of']) {
        const v = lit(name) as { project?: unknown } | undefined
        if (v && typeof v === 'object' && 'project' in v) out.push({ kind: 'projects', id: v.project, step: s.id, input: name })
      }
      const labels = lit('labels')
      if (Array.isArray(labels)) for (const id of labels) out.push({ kind: 'labels', id, step: s.id, input: 'labels' })
      if (lit('view') !== undefined) out.push({ kind: 'views', id: lit('view'), step: s.id, input: 'view' })
      if (lit('section') !== undefined) out.push({ kind: 'sections', id: lit('section'), step: s.id, input: 'section' })
      if (lit('webhook_id') !== undefined) out.push({ kind: 'webhooks', id: lit('webhook_id'), step: s.id, input: 'webhook_id' })
      walk([...(s.then ?? []), ...(s.otherwise ?? []), ...(s.do ?? [])])
    }
  }
  if (Array.isArray(d.steps)) walk(d.steps)
  return out
}

/**
 * The device's check of a draft (the server's checkDraft): its name, its
 * trigger, the shared type checker, every id it names among this device's
 * names, and, as errors, the steps not available to the person.
 */
export function checkDraftOnDevice(d: DraftedRoutine, names: DraftNames, catalogue: Catalogue | null): DraftProblem[] {
  const out: DraftProblem[] = []
  if (!d.name) out.push({ code: 'invalid_input', message: 'name: a routine needs a name' })
  const sets = { projects: names.projects, sections: names.sections, labels: names.labels, views: names.views, webhooks: names.webhooks }
  const has = (kind: keyof typeof sets, id: unknown) => typeof id === 'string' && sets[kind].some((n) => n.id === id)
  const tp = triggerProblem(d.trigger, has)
  if (tp) {
    out.push({ code: 'invalid_input', message: tp })
    return out
  }
  if (d.condition !== null && (typeof d.condition !== 'object' || Array.isArray(d.condition))) {
    out.push({ code: 'invalid_input', message: 'condition must be an object or null' })
    return out
  }
  if (!Array.isArray(d.steps) || !d.steps.length) {
    out.push({ code: 'invalid_input', message: 'steps: a routine needs at least one step' })
    return out
  }
  const e = draftError({ name: d.name, trigger: d.trigger, condition: d.condition, steps: d.steps })
  if (e) {
    out.push({ ...(e.step ? { step: e.step } : {}), ...(e.input ? { input: e.input } : {}), code: 'invalid_input', message: e.step ? `step ${e.step}: ${e.message}` : e.message })
    return out
  }
  const missing = namedIds(d).find((r) => !has(r.kind, r.id))
  if (missing) {
    out.push({ ...(missing.step ? { step: missing.step } : {}), ...(missing.input ? { input: missing.input } : {}), code: 'invalid_input',
      message: `${missing.step ? `step ${missing.step}: ` : 'condition: '}${String(missing.id)} is not one of the person's ${missing.kind}` })
  }
  const walk = (list: RoutineStep[]) => {
    for (const s of list) {
      if (STEPS.some((k) => k.kind === s.kind) && !isAvailable(catalogue, s.kind)) {
        out.push({ step: s.id, code: 'unavailable', message: `step ${s.id}: ${s.kind} is not available to this person (${catalogue?.[s.kind]?.reason ?? 'not available'}); use another step or say so in the note` })
      }
      walk([...(s.then ?? []), ...(s.otherwise ?? []), ...(s.do ?? [])])
    }
  }
  walk(d.steps)
  return out
}

/** The step kinds this device may offer the model: available now, never Get a specific task. */
export function availableKinds(catalogue: Catalogue | null): string[] {
  return STEPS.map((k) => k.kind).filter((k) => draftOffered(k) && isAvailable(catalogue, k))
}

/** A draft that gave no answer; code names why (the server route's codes). */
export class DraftError extends Error {
  constructor(public code: string, message: string) {
    super(message)
  }
}

const retryText = (probs: DraftProblem[]) => `The draft does not check:${probs.map((p) => `\n- ${p.message}`).join('')}\nCall draft_routine once more with a corrected draft.`

/** One draft turn on this device's provider: at most two model calls. */
export async function draftOnDevice(text: string, names: DraftNames, catalogue: Catalogue | null, signal?: AbortSignal): Promise<DraftAnswer> {
  const setup = await getDeviceSetup()
  if (!setup) throw new DraftError('ai_not_configured', 'the on-device assistant is not set up on this device')
  const { providerFor, ProviderError } = await import('../assistantDevice/providers')
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), DRAFT_CALL_MS)
  const abort = () => ctl.abort()
  signal?.addEventListener('abort', abort)
  const ans: DraftAnswer = { draft: null, note: '', errors: [] }
  try {
    const conv = providerFor(setup).start({ system: draftSystemFor(availableKinds(catalogue)), messages: [{ role: 'user', text: draftMessage(text, names) }], tools: [D.tool], maxTokens: D.limits.max_tokens })
    for (let attempt = 0; attempt < 2; attempt++) {
      let words = ''
      const r = await conv.next((t) => { if (words.length < 4096) words += t }, ctl.signal)
      switch (r.stop) {
        case 'end_turn': case 'tool_use': break
        case 'refusal': throw new DraftError('ai_refused', 'the model declined to answer')
        case 'max_tokens': throw new DraftError('ai_truncated', 'the draft was cut off because it reached the length limit')
        default: throw new DraftError('provider_error', 'the provider ended the answer for an unknown reason')
      }
      const call = r.toolCalls.find((c) => c.name === D.tool.name)
      if (!call) {
        if (!ans.draft) {
          ans.note = cutBytes(words.trim(), 500)
          ans.errors = [{ code: 'no_draft', message: 'the assistant did not draft a routine' }]
        }
        return ans
      }
      let args: unknown = null
      try { args = JSON.parse(call.args || '{}') } catch { args = null }
      const read = readDraft(args)
      const probs = [...read.problems, ...(read.draft ? checkDraftOnDevice(read.draft, names, catalogue) : [])]
      ans.draft = read.draft
      ans.note = read.note
      ans.errors = probs
      if (!probs.length || attempt === 1) return ans
      conv.addToolResults(r.toolCalls.map((c) => ({ id: c.id, content: c.id === call.id ? retryText(probs) : 'Only one draft_routine call is answered.', isError: true })))
    }
    return ans
  } catch (err) {
    if (err instanceof DraftError) throw err
    if (ctl.signal.aborted) throw new DraftError('provider_error', 'the provider did not answer in time')
    if (err instanceof ProviderError) throw new DraftError(err.code, err.message)
    throw new DraftError('provider_error', err instanceof Error ? err.message : 'the provider could not be reached')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}
