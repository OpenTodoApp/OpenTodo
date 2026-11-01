// One routine run in progress on this device: the port of internal/rules
// routine.go (runState: step, run, if, repeat, references, rendering and
// formatting). Every step plans against the rows with the changes the earlier
// steps planned laid over them; nothing is written here.
import type { RoutineArg, RoutineStep } from '../../types'
import { matchesCondition, type MatchContext, type MatchTask } from '../match'
import { holds, formatTemplate, renderNumber, valueLen, type StepValue } from '../stepData'
import { dateLiteral, placeholders, stepKind, textLiteral, type StepInput } from '../steps'
import { zonedInstant } from '../../dates'
import { totalsByTask, type EntryLike } from '../../time'
import { unavailableReason } from './available'
import { exec } from './kinds'
import { isNull } from './actions'
import { ArgError, planTool, ToolError, type ToolSnapshot } from './tools'
import type { Change, Row, RunOptions, RunRoutine, RunWorld, SideSpec, StepRecord } from './types'
import { resolveDate } from '../stepData'

export const MAX_WRITES = 500
export const MAX_ITERATIONS = 500
export const RUN_TIME_LIMIT = 60_000
export const AI_STEP_TIME = 90_000

/** A step that failed while planning: no later step runs and nothing is written. */
export class StepFail extends Error {
  constructor(readonly code: string, message: string) { super(message) }
}

/** A Stop step: the run ends with outcome ended. */
export class Ended extends Error {}

export const fail = (code: string, message: string) => new StepFail(code, message)

export type Inputs = Map<string, StepValue>
export type ExecResult = [StepValue, string]

export const none = (): StepValue => ({ type: 'none' })
export const taskVal = (id: string): StepValue => ({ type: 'task', id })
export const tasksVal = (ids: string[] | null | undefined): StepValue => ({ type: 'tasks', ids: ids ?? [] })

export const str = (r: Row | undefined, f: string): string => (typeof r?.[f] === 'string' ? (r[f] as string) : '')
export const num = (r: Row | undefined, f: string): number => (typeof r?.[f] === 'number' ? (r[f] as number) : 0)
export const isDeleted = (r: Row | undefined): boolean => !!r && !isNull(r.deleted_at)

const accepts = (def: StepInput | undefined, t: string) => !!def?.accepts.includes(t as never)
const isList = (t: string) => t === 'tasks' || t === 'lines'

export class RunState {
  readonly w: RunWorld
  readonly r: RunRoutine
  readonly o: RunOptions
  readonly tasks = new Map<string, Row>()
  readonly projects = new Map<string, Row>()
  readonly sections = new Map<string, Row>()
  labels: Row[]
  /** The stored preferences and time entries: the server's tools read them unplanned. */
  readonly prefs: Row
  readonly timeEntries: Row[]
  readonly labelNames = new Set<string>()
  readonly labelName = new Map<string, string>()
  readonly parent = new Map<string, string>()
  readonly overlay: Change[] = []
  readonly completing = new Set<string>()
  readonly sides: SideSpec[] = []
  readonly vals = new Map<string, StepValue>()
  trigger: StepValue = { type: 'task' }
  curItem: StepValue | null = null
  failedAt = 0
  readonly records: StepRecord[] = []
  readonly previews: Record<string, unknown> = {}
  iterations = 0
  seq = 0
  emails = 0
  callAI: boolean
  aiTokens = 0
  readonly aiTexts: string[] = []
  readonly test: boolean
  readonly start: number
  deadline: number
  readonly clock: () => number
  readonly runId: string
  readonly key: string
  private trackedCache: Map<string, number> | null = null

  constructor(w: RunWorld, r: RunRoutine, o: RunOptions) {
    this.w = w
    this.r = r
    this.o = o
    this.test = !!o.test
    this.callAI = !o.test || !!o.callAI
    this.clock = o.clock ?? Date.now
    this.start = this.clock()
    this.deadline = this.start + RUN_TIME_LIMIT
    this.runId = o.runId
    this.key = o.key
    const walk = (list: RoutineStep[]) => {
      for (const s of list) {
        if (s.kind === 'ask_ai' || s.kind === 'summarise') this.deadline += AI_STEP_TIME
        walk(s.then ?? []); walk(s.otherwise ?? []); walk(s.do ?? [])
      }
    }
    walk(r.steps)
    for (const t of w.tasks) if (!isDeleted(t)) this.tasks.set(str(t, 'id'), t)
    for (const p of w.projects) {
      if (isDeleted(p)) continue
      this.projects.set(str(p, 'id'), p)
      this.parent.set(str(p, 'id'), str(p, 'parent_id'))
    }
    for (const s of w.sections) if (!isDeleted(s)) this.sections.set(str(s, 'id'), s)
    this.labels = w.labels.filter((l) => !isDeleted(l))
    for (const l of this.labels) {
      this.labelNames.add(str(l, 'name').trim().toLowerCase())
      this.labelName.set(str(l, 'id'), str(l, 'name'))
    }
    this.prefs = { ...(w.prefs ?? {}) }
    this.timeEntries = w.timeEntries.filter((e) => !isDeleted(e))
  }

  /** The routine caller's token id (agenttools Caller.TokenID). */
  get tokenId(): string { return `rule:${this.r.id}` }

  liveTask(id: string): Row | undefined {
    const t = this.tasks.get(id)
    return t && !isDeleted(t) ? t : undefined
  }

  liveProject(id: string): Row | undefined {
    const p = this.projects.get(id)
    return p && !isDeleted(p) ? p : undefined
  }

  // ---- the plan ----

  async plan(): Promise<{ failed: number; err: unknown }> {
    try {
      await this.list(this.r.steps)
      return { failed: -1, err: null }
    } catch (e) {
      if (e instanceof Ended) return { failed: -1, err: e }
      return { failed: this.failedAt, err: e }
    }
  }

  async list(steps: RoutineStep[]): Promise<void> {
    for (const s of steps) await this.step(s)
  }

  writesPlanned(): number {
    const seen = new Set(this.overlay.map((c) => `${c.entity}\x00${c.entityId}`))
    return seen.size + this.sides.length
  }

  private async step(s: RoutineStep): Promise<void> {
    const began = this.clock()
    let at = this.records.findIndex((r) => r.step_id === s.id)
    const again = at >= 0
    if (!again) {
      this.records.push({ index: this.records.length, step_id: s.id, kind: s.kind, status: 'ok', duration_ms: 0, items: 0, output: '', ids: [] })
      at = this.records.length - 1
    }
    const finish = (out: StepValue | null, status: string, err: unknown) => {
      const rec = this.records[at]
      const items = out ? (out.type === 'number' || out.type === 'date' ? 1 : valueLen(out)) : 0
      rec.duration_ms += this.clock() - began
      if (out?.type) rec.output = out.type
      rec.items = again ? rec.items + items : items
      if (err) this.failedAt = at
      if (rec.status === 'ok' && status) rec.status = status as StepRecord['status']
      for (const id of out ? idsOf(out) : []) if (rec.ids.length < 50) rec.ids.push(id)
      if (this.test && out) this.previews[s.id] = this.preview(out)
      if (err instanceof StepFail) {
        if (rec.status !== 'unavailable') rec.status = 'failed'
        rec.error = err.code
      } else if (err instanceof Ended) rec.status = 'ended'
      else if (err) { rec.status = 'failed'; rec.error = 'internal' }
      if (err) throw err
    }
    if (this.clock() > this.deadline) return finish(null, '', fail('time_limit', 'the run took longer than 1m0s'))
    const reason = unavailableReason(s, this.w.env ?? {}, this.w.encrypted)
    if (reason) {
      this.records[at].status = 'unavailable'
      return finish(null, '', fail(`unavailable:${reason}`, `Not available: ${reason}`))
    }
    let out: StepValue = none()
    let status = ''
    let err: unknown = null
    try {
      [out, status] = await this.run(s, at)
    } catch (e) {
      err = e
    }
    if (!err && this.writesPlanned() > MAX_WRITES) err = fail('write_limit', `the run would write ${this.writesPlanned()} items, more than ${MAX_WRITES}`)
    if (!err) this.vals.set(s.id, out)
    return finish(err ? (err instanceof StepFail || err instanceof Ended ? out : null) : out, status, err)
  }

  ref(name: string): StepValue | undefined {
    if (name === 'trigger') return this.trigger
    if (name === 'item') return this.curItem ?? undefined
    return this.vals.get(name)
  }

  private async run(s: RoutineStep, at: number): Promise<ExecResult> {
    if (s.kind === 'if') return this.runIf(s)
    if (s.kind === 'repeat') return this.runRepeat(s)
    const k = stepKind(s.kind)
    const inputs: Inputs = new Map()
    let eachName = ''
    let each: StepValue | null = null
    for (const [name, a] of Object.entries(s.in ?? {})) {
      if (!('ref' in a)) continue
      const v = this.ref(a.ref)
      if (!v) throw fail('invalid_argument', `${s.kind}.${name}: ${a.ref} has no value`)
      const def = k?.inputs.find((d) => d.name === name)
      if (isList(v.type) && !accepts(def, v.type)) { eachName = name; each = v }
      inputs.set(name, v)
    }
    if (!each) return exec(this, s, inputs, at)
    const items = elements(each)
    this.iterations += items.length
    if (this.iterations > MAX_ITERATIONS) throw fail('iteration_limit', `a run may repeat at most ${MAX_ITERATIONS} times`)
    const outs: StepValue[] = []
    let status = ''
    for (let i = 0; i < items.length; i++) {
      inputs.set(eachName, items[i])
      this.seq = i
      const [out, s2] = await exec(this, s, inputs, at)
      if (s2) status = s2
      outs.push(out)
    }
    return [collect(k?.output ?? 'none', outs), status]
  }

  private async runIf(s: RoutineStep): Promise<ExecResult> {
    const a = s.in?.value
    const v = a && 'ref' in a ? this.ref(a.ref) : undefined
    if (!v) throw fail('invalid_argument', 'if: no value')
    const isArg = s.in?.is
    let is = { ...((isArg && 'literal' in isArg ? isArg.literal : {}) as Record<string, unknown>) }
    const [op, x] = Object.entries(is)[0] ?? ['', undefined]
    if (typeof x === 'string' && v.type === 'date') {
      const d = dateLiteral(x)
      if (d) is = { [op]: resolveDate(d, this.w.today) }
    }
    await this.list(holds(v, is) ? s.then ?? [] : s.otherwise ?? [])
    return [none(), '']
  }

  private async runRepeat(s: RoutineStep): Promise<ExecResult> {
    const a = s.in?.list
    const list = a && 'ref' in a ? this.ref(a.ref) : undefined
    if (!list) throw fail('invalid_argument', 'repeat: no list')
    const items = elements(list)
    this.iterations += items.length
    if (this.iterations > MAX_ITERATIONS) throw fail('iteration_limit', `a run may repeat at most ${MAX_ITERATIONS} times`)
    const prev = this.curItem
    const outs: StepValue[] = []
    const body = s.do ?? []
    try {
      for (const it of items) {
        this.curItem = it
        await this.list(body)
        if (body.length) outs.push(this.vals.get(body[body.length - 1].id) ?? none())
      }
    } finally {
      this.curItem = prev
    }
    const single = body.length ? this.vals.get(body[body.length - 1].id)?.type ?? 'none' : 'none'
    return [collect(single, outs), '']
  }

  // ---- reading inputs ----

  /** A literal input (undefined for a reference or a missing input). */
  lit(s: RoutineStep, name: string): unknown {
    const a: RoutineArg | undefined = s.in?.[name]
    return a && 'literal' in a ? a.literal : undefined
  }

  litNum(s: RoutineStep, name: string): number | undefined {
    const v = this.lit(s, name)
    return typeof v === 'number' ? v : undefined
  }

  litStr(s: RoutineStep, name: string): string | undefined {
    const v = this.lit(s, name)
    return typeof v === 'string' ? v : undefined
  }

  litBool(s: RoutineStep, name: string): boolean | undefined {
    const v = this.lit(s, name)
    return typeof v === 'boolean' ? v : undefined
  }

  litStrings(s: RoutineStep, name: string): string[] | undefined {
    const v = this.lit(s, name)
    return Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : undefined
  }

  /** A task, task list or project input: a reference or a literal {task}/{project}. */
  entityIn(s: RoutineStep, inputs: Inputs, name: string): StepValue | undefined {
    const v = inputs.get(name)
    if (v) {
      const def = stepKind(s.kind)?.inputs.find((d) => d.name === name)
      if (v.type === 'task' && accepts(def, 'tasks') && !accepts(def, 'task')) return tasksVal([v.id ?? ''])
      return v
    }
    const l = this.lit(s, name) as Record<string, unknown> | undefined
    if (l && typeof l === 'object' && !Array.isArray(l)) {
      if (typeof l.task === 'string' && l.task) return taskVal(l.task)
      if (typeof l.project === 'string' && l.project) return { type: 'project', id: l.project }
    }
    return undefined
  }

  /** A text literal, with a {format} template expanded. */
  litText(raw: unknown): string {
    const tl = textLiteral(raw)
    if (!tl) return ''
    return tl.template ? this.format(tl.text) : tl.text
  }

  format(template: string): string {
    const vals: Record<string, string> = {}
    for (const p of placeholders(template)) {
      const v = this.ref(p)
      if (v) vals[p] = this.render(v)
    }
    return formatTemplate(template, vals)
  }

  render(v: StepValue): string {
    switch (v.type) {
      case 'text': return v.text ?? ''
      case 'lines': return (v.lines ?? []).join('\n')
      case 'number': return renderNumber(v.number ?? 0)
      case 'date': return v.date ?? ''
      case 'task': return str(this.tasks.get(v.id ?? ''), 'title')
      case 'tasks': return (v.ids ?? []).map((id) => str(this.tasks.get(id), 'title')).join('\n')
      case 'project': return str(this.projects.get(v.id ?? ''), 'name')
    }
    return ''
  }

  /** An input as text: a reference rendered, or a literal expanded; null when absent. */
  textIn(s: RoutineStep, inputs: Inputs, name: string): string | null {
    const v = inputs.get(name)
    if (v) return this.render(v)
    const a = s.in?.[name]
    if (!a) return null
    return this.litText('literal' in a ? a.literal : undefined)
  }

  preview(v: StepValue): unknown {
    switch (v.type) {
      case 'text': return v.text
      case 'lines': return v.lines
      case 'number': return v.number
      case 'date': return v.date
      case 'task': return { id: v.id, title: str(this.tasks.get(v.id ?? ''), 'title') }
      case 'tasks': return (v.ids ?? []).map((id) => ({ id, title: str(this.tasks.get(id), 'title') }))
      case 'project': return { id: v.id, name: str(this.projects.get(v.id ?? ''), 'name') }
    }
    return null
  }

  // ---- matching ----

  tracked(): Map<string, number> {
    if (!this.trackedCache) this.trackedCache = totalsByTask(this.w.timeEntries as unknown as EntryLike[], this.w.now)
    return this.trackedCache
  }

  matchContext(): MatchContext {
    return {
      userId: this.w.userId, today: this.w.today, parent: (id) => this.parent.get(id) || null,
      open: (id) => { const x = this.tasks.get(id); return !!x && isNull(x.completed_at) && isNull(x.deleted_at) },
      tracked: (id) => this.tracked().get(id) ?? 0,
      changed: (id) => this.w.changed?.[id] ?? '',
    }
  }

  matchTask(t: Row): MatchTask {
    const due = t.due as { date?: string; time?: string; tz?: string } | null | undefined
    let dueDate: string | null = due?.date || null
    if (due?.date && due.tz && due.time) {
      try {
        const ms = zonedInstant(due.date, due.time, due.tz)
        dueDate = new Date(ms + this.w.offset * 60_000).toISOString().slice(0, 10)
      } catch { /* an unknown zone keeps the date */ }
    }
    const list = (f: string) => (Array.isArray(t[f]) ? (t[f] as string[]) : [])
    return {
      id: str(t, 'id'), project_id: str(t, 'project_id') || null, section_id: str(t, 'section_id') || null, labels: list('labels'),
      priority: num(t, 'priority'), dueDate, deadline: str(t, 'deadline') || null, start: str(t, 'start') || null, evening: t.evening === true,
      blocked_by: list('blocked_by'), assignee_id: str(t, 'assignee_id') || null, origin: t.origin ?? null, habit: t.habit === true,
      estimate_minutes: typeof t.estimate_minutes === 'number' ? t.estimate_minutes : null,
    }
  }

  matchCond(c: unknown, t: Row): boolean {
    return matchesCondition(c as never, this.matchTask(t), this.matchContext())
  }

  // ---- planning through the tools ----

  /** client_request_id of a create: the run, the step and the item. */
  clientId(at: number): string {
    return `${this.runId}:${at}:${this.seq}`
  }

  snapshot(): ToolSnapshot {
    return {
      userId: this.w.userId, tokenId: this.tokenId, now: this.w.now, tasks: this.tasks, projects: this.projects, labels: this.labels,
      sections: this.sections, timeEntries: this.timeEntries, prefs: this.prefs, memberships: this.w.memberships,
    }
  }

  /** Plans a tool with the routine caller and lays its changes over the run's view. */
  tool(name: string, args: Record<string, unknown>): Change[] {
    let changes: Change[]
    try {
      changes = planTool(this.snapshot(), name, args).changes
    } catch (e) {
      if (e instanceof ToolError) throw fail(e.code || 'invalid_argument', e.message)
      if (e instanceof ArgError) throw fail('invalid_argument', e.message)
      throw e
    }
    this.lay(...changes)
    return changes
  }

  lay(...cs: Change[]): void {
    for (const c of cs) {
      this.overlay.push(c)
      const merge = (m: Map<string, Row>) => m.set(c.entityId, { ...(m.get(c.entityId) ?? {}), id: c.entityId, ...c.patch })
      switch (c.entity) {
        case 'task': merge(this.tasks); break
        case 'project': merge(this.projects); break
        case 'section':
          if (c.create || this.sections.has(c.entityId)) this.sections.set(c.entityId, { ...(this.sections.get(c.entityId) ?? { _planned: true }), id: c.entityId, ...c.patch })
          break
        case 'label':
          if (c.create) this.labels = [...this.labels, { id: c.entityId, ...c.patch }]
          break
      }
    }
  }

  /** A live label of that name (ignoring case), planned ones included. */
  labelExists(name: string): boolean {
    const n = name.trim().toLowerCase()
    if (this.overlay.some((c) => c.entity === 'label' && typeof c.patch.name === 'string' && c.patch.name.toLowerCase() === name.toLowerCase())) return true
    return this.labelNames.has(n)
  }
}

export function idsOf(v: StepValue): string[] {
  if (v.type === 'tasks') return v.ids ?? []
  if ((v.type === 'task' || v.type === 'project') && v.id) return [v.id]
  return []
}

/** A list split into single values. */
export function elements(v: StepValue): StepValue[] {
  if (v.type === 'tasks') return (v.ids ?? []).map((id) => taskVal(id))
  if (v.type === 'lines') return (v.lines ?? []).map((text) => ({ type: 'text', text }))
  return []
}

/** Per-item outputs collected into a list (Repeat's output, a for-each). */
export function collect(single: string, outs: StepValue[]): StepValue {
  let type: 'tasks' | 'lines' | '' = ''
  const ids: string[] = []
  const lines: string[] = []
  for (const o of outs) {
    switch (o.type) {
      case 'task': type = 'tasks'; ids.push(o.id ?? ''); break
      case 'tasks': type = 'tasks'; ids.push(...(o.ids ?? [])); break
      case 'text': type = 'lines'; lines.push(o.text ?? ''); break
      case 'lines': type = 'lines'; lines.push(...(o.lines ?? [])); break
    }
  }
  if (type === 'tasks') return { type, ids }
  if (type === 'lines') return { type, lines }
  if (single === 'task' || single === 'tasks') return tasksVal([])
  if (single === 'text' || single === 'lines') return { type: 'lines', lines: [] }
  return none()
}
