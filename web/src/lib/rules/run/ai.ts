// The AI steps of a device run (internal/rules/routine_ai.go aiStep): Ask AI
// and Summarise make one call each through the device's own provider, passed
// in as RunOptions.ai, within the routine's daily token budget; the answers
// are remembered so items can be marked "Written by AI".
import type { RoutineStep } from '../../types'
import { aiAnswer } from '../steps'
import { budgetOf, estimateTokens } from '../ai'
import { isNull } from './actions'
import { textOut } from './kinds'
import { fail, str, num, type ExecResult, type Inputs, type RunState } from './state'
import { AIError, MAX_RUN_BLOCKS, type AICall, type RunBlock } from './types'
import type { StepValue } from '../stepData'

const TEXT_TOKENS = 1000
const LINES_TOKENS = 2000
const SHORT_TOKENS = 200
const MEDIUM_TOKENS = 400

function summaryInstruction(length: string): string {
  return length === 'medium' ? 'Summarise the material in about 150 words.' : 'Summarise the material in about 50 words.'
}

/** One task for the model: "- title (due …, priority …, labels …, project …)", with "id …" first when withId. */
function taskLine(st: RunState, id: string, withId: boolean): string {
  const t = st.tasks.get(id)
  const parts: string[] = []
  if (withId) parts.push(`id ${id}`)
  const due = t?.due as { date?: string; time?: string } | null | undefined
  if (due?.date) parts.push(`due ${due.date} ${due.time ?? ''}`.trim())
  const p = Math.trunc(num(t, 'priority'))
  if (p >= 1 && p <= 3) parts.push(`priority ${p}`)
  const names = (Array.isArray(t?.labels) ? (t!.labels as string[]) : []).map((l) => st.labelName.get(l) ?? '').filter(Boolean)
  if (names.length) parts.push(`labels ${names.join(', ')}`)
  const pid = str(t, 'project_id')
  if (pid) { const n = str(st.projects.get(pid), 'name'); if (n) parts.push(`project ${n}`) }
  let line = `- ${str(t, 'title')}`
  if (parts.length) line += ` (${parts.join(', ')})`
  return line
}

/** A value as the model reads it (D1); a call that may show blocks names each task's id (assistant-routine-blocks D1). */
function material(st: RunState, v: StepValue, ids: boolean): string {
  switch (v.type) {
    case 'task': return taskLine(st, v.id ?? '', ids)
    case 'tasks': return (v.ids ?? []).map((id) => taskLine(st, id, ids)).join('\n')
    case 'project': {
      const id = v.id ?? ''
      let b = `Project: ${str(st.projects.get(id), 'name')}`
      const sections = st.w.sections.filter((x) => str(x, 'project_id') === id && isNull(x.deleted_at) && str(x, 'name')).map((x) => str(x, 'name')).sort()
      if (sections.length) b += `\nSections: ${sections.join(', ')}`
      const open = [...st.tasks.entries()].filter(([, t]) => str(t, 'project_id') === id && isNull(t.completed_at) && isNull(t.deleted_at)).map(([tid]) => tid).sort().slice(0, 500)
      if (open.length) b += '\nOpen tasks:' + open.map((tid) => `\n${taskLine(st, tid, ids)}`).join('')
      return b
    }
  }
  return st.render(v)
}

function callOf(st: RunState, s: RoutineStep, inputs: Inputs): AICall {
  if (s.kind === 'summarise') {
    const length = st.litStr(s, 'length') ?? ''
    const c: AICall = { instruction: summaryInstruction(length), context: [], answer: 'text', maxTokens: length === 'medium' ? MEDIUM_TOKENS : SHORT_TOKENS }
    const v = inputs.get('text')
    if (v) c.context.push(material(st, v, false))
    return c
  }
  const answer = aiAnswer(s)
  const instr = s.in?.instruction
  const c: AICall = { instruction: st.litText(instr && 'literal' in instr ? instr.literal : undefined), context: [], answer, maxTokens: answer === 'lines' ? LINES_TOKENS : TEXT_TOKENS }
  if (answer !== 'lines') c.show = Math.max(MAX_RUN_BLOCKS - st.blocks.length, 0)
  for (const name of ['context', 'context2', 'context3']) {
    const v = inputs.get(name)
    if (v) c.context.push(material(st, v, (c.show ?? 0) > 0))
  }
  return c
}

const BLOCK_DATE = /^\d{4}-\d{2}-\d{2}$/
const BLOCK_ID = /^[A-Za-z0-9_-]{1,64}$/

/** Whether a block is one a run may keep (internal/rules RunBlock.valid; the server checks again). */
function validBlock(b: RunBlock): boolean {
  switch (b.kind) {
    case 'tasks': return b.ids.length > 0 && b.ids.length <= 20 && b.ids.every((id) => BLOCK_ID.test(id))
    case 'calendar': return BLOCK_DATE.test(b.date) && (b.span === 'day' || b.span === 'week')
    case 'deadlines': return BLOCK_DATE.test(b.from) && BLOCK_DATE.test(b.to) && b.from <= b.to
  }
  return false
}

/** A call's expected tokens: the material at four characters a token, plus the answer's maximum. */
export function estimateCall(c: AICall): number {
  return estimateTokens(Array.from([c.instruction, ...c.context].join('\n')).length, c.maxTokens)
}

export async function aiStep(st: RunState, s: RoutineStep, inputs: Inputs, at: number): Promise<ExecResult> {
  const call = callOf(st, s, inputs)
  const empty: StepValue = s.kind === 'ask_ai' && call.answer === 'lines' ? { type: 'lines', lines: [] } : { type: 'text', text: '' }
  if (!st.o.ai) throw fail('ai_not_configured', 'the assistant is not set up on this device')
  const est = estimateCall(call)
  const rec = st.records[at]
  rec.estimate = (rec.estimate ?? 0) + est
  if (!st.callAI) return [empty, 'skipped']
  const used = st.o.aiTokensToday ?? 0
  const budget = budgetOf(st.r.aiBudget)
  if (used + st.aiTokens + est > budget) {
    throw fail('ai_budget', `Daily AI budget reached: ${used + st.aiTokens} of ${budget} tokens used today, this step needs about ${est}`)
  }
  let ans
  try {
    ans = await st.o.ai(call)
  } catch (e) {
    if (e instanceof AIError) throw fail(e.code, e.message)
    throw e
  }
  const tokens = (ans.input || 0) + (ans.output || 0)
  rec.tokens = (rec.tokens ?? 0) + tokens
  st.aiTokens += tokens
  // Only a step offered the show tools keeps blocks, within what the run has left.
  for (const b of (ans.blocks ?? []).slice(0, call.show ?? 0)) if (st.blocks.length < MAX_RUN_BLOCKS && validBlock(b)) st.blocks.push(b)
  if (call.answer === 'lines' && s.kind === 'ask_ai') {
    const lines = (ans.lines ?? []).slice(0, 500)
    st.aiTexts.push(...lines)
    return [{ type: 'lines', lines }, '']
  }
  st.aiTexts.push(ans.text ?? '')
  return textOut(ans.text ?? '')
}
