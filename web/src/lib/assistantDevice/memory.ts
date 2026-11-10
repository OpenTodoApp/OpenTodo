// Memory on the device (OpenSpec change assistant-memory, design D2, D3):
// internal/assistant memory.go in the browser. The live items from this
// device's decrypted rows go into the instructions (pinned by
// prompt.vectors.json), and remember plans a new item into the draft (pinned by
// memory.vectors.json). Nothing is written until the user applies the proposal.
import type { ProposedChange } from '../assistantTypes'
import { db } from '../db'
import { cleanMemory, collapse } from '../memory'
import { manifest } from './manifest'

const ID_RE = /^[A-Za-z0-9._:@+=~-]{1,64}$/

/** The items in the instructions (memorySection): at most 20, in order; '' when none. */
export function memorySection(items: readonly string[]): string {
  const lines = items.map(cleanMemory).filter(Boolean).slice(0, manifest.memory.max_items).map((s) => `- ${s}`)
  return lines.length ? `\n\n${manifest.memory.note}\n${lines.join('\n')}\n` : ''
}

export interface RememberPlan {
  result: Record<string, unknown>
  change?: ProposedChange
}

/** One remember call over the live items and the draft's new ones (PlanRemember). */
export function planRemember(live: readonly string[], draft: readonly ProposedChange[], args: unknown, id: string, now: number): RememberPlan {
  const m = manifest.memory
  const invalid = { result: { error: 'invalid_arguments', message: m.messages.invalid } }
  if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length !== 1) return invalid
  const raw = (args as Record<string, unknown>).text
  if (typeof raw !== 'string') return invalid
  const text = collapse(raw)
  if (!text || [...text].length > m.max_text || text.startsWith('enc:')) return invalid
  const have = [...live, ...draft.filter((c) => c.entity === 'memory' && c.create).map((c) => String(c.patch.text ?? ''))]
  if (have.some((h) => cleanMemory(h).toLowerCase() === text.toLowerCase())) return { result: { error: 'already_remembered', message: m.messages.duplicate } }
  if (have.length >= m.max_items) return { result: { error: 'memory_full', message: m.messages.full, limit: m.max_items } }
  return {
    result: { proposed: true, text, status_note: m.messages.proposed },
    change: { entity: 'memory', entityId: id, create: true, patch: { text, position: now, created_at: now } },
  }
}

/** The new memory items of an open proposal this device keeps (openMemory), and the other items. */
export async function checkOpenMemory(items: readonly ProposedChange[] | undefined): Promise<{ memory: ProposedChange[]; rest: ProposedChange[] }> {
  const rest = (items ?? []).filter((c) => c.entity !== 'memory')
  const mem = (items ?? []).filter((c) => c.entity === 'memory')
  if (!mem.length) return { memory: [], rest }
  const known = new Set((await db.memories.toArray()).map((r) => r.id))
  const memory: ProposedChange[] = []
  for (const c of mem) {
    const fields = Object.keys(c.patch ?? {})
    const text = c.patch?.text
    const ok = c.create && !known.has(c.entityId) && ID_RE.test(c.entityId) && !Object.keys(c.base ?? {}).length
      && typeof text === 'string' && !!text.trim() && !/[\r\n]/.test(text) && [...text.trim()].length <= manifest.memory.max_text && !text.startsWith('enc:')
      && fields.every((f) => f === 'text' || ((f === 'position' || f === 'created_at') && typeof c.patch[f] === 'number'))
    if (!ok) continue
    known.add(c.entityId)
    memory.push({ entity: 'memory', entityId: c.entityId, create: true, patch: c.patch })
  }
  return { memory, rest }
}
