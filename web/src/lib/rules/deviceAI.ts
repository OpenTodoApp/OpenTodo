// The AI steps of a routine run on this device (OpenSpec change
// routines-ai-step, D1 and D7): a call to the on-device assistant's provider
// per step, with the server's fixed instructions and checks from the manifest
// (internal/assistant/routine.go: RoutineSystem, RoutineMessage, AnswerLines).
// An Ask AI step answering in text may show blocks (assistant-routine-blocks
// D1): the same show tools, checks against this device's rows and limits as
// the server, kept as kind and parameters only.
// The key and the provider are this device's; usage is never reported to the
// assistant's records (in-app-assistant "On-device usage stays on the
// device"), only the tokens on the run's record so the routine's budget holds.
import { api } from '../api'
import type { AssistantBlock } from '../assistantBlocks'
import { manifest } from '../assistantDevice/manifest'
import { getDeviceSetup } from '../assistantDevice/settings'
import type { RunBlock } from './run/types'

export const ROUTINE_SYSTEM = manifest.routine.system

export const UNTRUSTED_NOTE = manifest.untrusted_note

export const MAX_ROUTINE_LINES = 500
export const MAX_ROUTINE_BYTES = 64 * 1024
/** Each provider call may take 60 seconds (D1). */
export const ROUTINE_CALL_MS = 60_000

export interface DeviceAICall {
  instruction: string
  context: string[]
  answer: 'text' | 'lines' | string
  maxTokens: number
  /** How many blocks the call may still show; 0 or none offers no show tool (assistant-routine-blocks D1). */
  show?: number
}

export interface DeviceAIAnswer {
  text: string
  lines?: string[]
  input: number
  output: number
  blocks?: RunBlock[]
}

/** A shown block as a run keeps it: kind and parameters, never the model's heading. */
export function runBlockOf(b: AssistantBlock): RunBlock | null {
  switch (b.kind) {
    case 'tasks': return { kind: 'tasks', ids: [...b.ids] }
    case 'calendar': return { kind: 'calendar', date: b.date, span: b.span }
    case 'deadlines': return { kind: 'deadlines', from: b.from, to: b.to }
  }
  return null
}

/** The fixed instruction of a call: the routine's, with the show note when it may show blocks. */
export function routineSystemFor(c: DeviceAICall): string {
  return (c.show ?? 0) > 0 ? `${manifest.routine.system}\n${manifest.routine.show_note}` : manifest.routine.system
}

/** A call that gave no answer; code is the failed step's error code. */
export class DeviceAIError extends Error {
  constructor(public code: string, message: string) {
    super(message)
  }
}

/** The user message of a routine call (RoutineMessage). */
export function routineMessage(c: DeviceAICall): string {
  let out = c.instruction + '\n\n'
  out += c.answer === 'lines'
    ? 'Answer as a list: one item per line, at most 500 lines, without numbering, bullets or blank lines.'
    : 'Answer as plain text.'
  if (c.context.length) {
    out += '\n\n' + UNTRUSTED_NOTE
    for (const item of c.context) out += '\n' + JSON.stringify({ untrusted_text: item })
  }
  return out
}

/** An answer's lines: trimmed, without empty lines or list markers, at most 500 (AnswerLines). */
export function answerLines(text: string): string[] {
  const out: string[] = []
  for (let l of text.split('\n')) {
    l = l.trim()
    for (const p of ['- ', '* ', '• ']) if (l.startsWith(p)) l = l.slice(p.length).trim()
    const m = /^(\d{1,3})[.)] /.exec(l)
    if (m) l = l.slice(m[0].length).trim()
    if (!l) continue
    if (out.length === MAX_ROUTINE_LINES) break
    out.push(l)
  }
  return out
}

/** Cuts text to at most n UTF-8 bytes on a character boundary. */
export function cutBytes(s: string, n: number): string {
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

/** Whether this device can run AI steps: the on-device assistant set up, and consent for routines. */
export async function deviceAIReady(): Promise<boolean> {
  if (!(await getDeviceSetup())) return false
  try {
    const s = await api.getMyAssistant()
    return !!s.consented && s.routines_consented === true
  } catch {
    return false
  }
}

/** One AI step's provider call on this device. */
export async function completeOnDevice(c: DeviceAICall, signal?: AbortSignal): Promise<DeviceAIAnswer> {
  const setup = await getDeviceSetup()
  if (!setup) throw new DeviceAIError('ai_not_configured', 'the on-device assistant is not set up on this device')
  const { providerFor, ProviderError } = await import('../assistantDevice/providers')
  const show = Math.max(0, Math.min(c.show ?? 0, manifest.routine.max_blocks))
  const tools = show ? manifest.tools.filter((t) => manifest.routine.tools.includes(t.name)) : []
  const display = show ? await import('../assistantDevice/blocks') : null
  const turn = { shown: manifest.limits.max_blocks - show }
  const blocks: RunBlock[] = []
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ROUTINE_CALL_MS)
  const abort = () => ctl.abort()
  signal?.addEventListener('abort', abort)
  let text = ''
  try {
    const conv = providerFor(setup).start({ system: routineSystemFor(c), messages: [{ role: 'user', text: routineMessage(c) }], tools, maxTokens: c.maxTokens > 0 ? c.maxTokens : 1000 })
    let input = 0
    let output = 0
    let r
    for (let round = 1; ; round++) {
      r = await conv.next((d) => { if (text.length < 4 * MAX_ROUTINE_BYTES) text += d }, ctl.signal)
      // The daily budget weighs cache reads at one tenth, like the server (assistant-usage-cache D1).
      input += r.input + (r.cacheWrite ?? 0) + Math.ceil((r.cached ?? 0) / 10)
      output += r.output
      if (r.stop !== 'tool_use' || !display) break
      // Still asking to show after the last round: the blocks so far stay, the text is the answer.
      if (round === manifest.routine.max_rounds) { r = { ...r, stop: 'end_turn' }; break }
      const results = []
      for (const call of r.toolCalls) {
        if (!manifest.routine.tools.includes(call.name)) {
          results.push({ id: call.id, content: JSON.stringify({ error: 'unknown_tool', message: 'this step offers only the show tools' }), isError: true })
          continue
        }
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(call.args || '{}') as Record<string, unknown> } catch { /* invalid arguments below */ }
        const res = await display.runDisplay(call.name, args && typeof args === 'object' ? args : {}, turn, (b) => {
          const kept = b.kind === 'followups' ? null : runBlockOf(b)
          if (kept) blocks.push(kept)
        })
        results.push({ id: call.id, content: res.content, isError: res.isError })
      }
      conv.addToolResults(results)
    }
    switch (r.stop) {
      case 'end_turn': break
      case 'refusal': throw new DeviceAIError('ai_refused', 'the model declined to answer')
      case 'max_tokens': throw new DeviceAIError('ai_truncated', 'the answer was cut off because it reached the length limit')
      default: throw new DeviceAIError('provider_error', 'the provider ended the answer for an unknown reason')
    }
    const out = cutBytes(text.trim(), MAX_ROUTINE_BYTES)
    return { text: out, ...(c.answer === 'lines' ? { lines: answerLines(out) } : {}), input, output, ...(blocks.length ? { blocks } : {}) }
  } catch (err) {
    if (err instanceof DeviceAIError) throw err
    if (ctl.signal.aborted) throw new DeviceAIError('provider_error', 'the provider did not answer within 60 seconds')
    if (err instanceof ProviderError) throw new DeviceAIError(err.code, err.message)
    throw new DeviceAIError('provider_error', err instanceof Error ? err.message : 'the provider could not be reached')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}
