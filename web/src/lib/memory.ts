// What the assistant remembers (OpenSpec change assistant-memory): short facts
// the user confirmed, one synced `memory` row each, written only through the op
// log (applyBatch → mutateMany), so they work offline, sync later and converge
// per field. Every assistant turn sends the live items in order (D3); they never
// go to MCP clients, agent tokens or routines. A device keeps at most 20 live
// items of 200 characters: Add refuses the 21st here, and devices that were
// offline together may hold more, which turns send only the first 20 of.
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type AssistantUndo } from './db'
import { UNDECRYPTABLE } from './e2ee'
import { t } from './i18n'
import { uuid } from './ids'
import type { MemoryItem } from './types'
import { applyBatch } from './undo'

/** The most live items (internal/assistant MaxMemoryItems; a test keeps them equal). */
export const MAX_MEMORY_ITEMS = 20
/** The longest item in characters (internal/sync MaxMemoryText). */
export const MAX_MEMORY_TEXT = 200

export type MemoryErrorCode = 'full' | 'invalid' | 'duplicate'

/** A refused add or edit, with the words to show. */
export class MemoryError extends Error {
  constructor(readonly code: MemoryErrorCode) {
    super(code === 'full' ? t('Memory holds 20 items. Remove one first.') : code === 'duplicate' ? t('Memory already holds this.') : t('Write one line of up to 200 characters.'))
  }
}

/** Whitespace runs and line breaks become one space (internal/assistant CleanMemory, without the cut). */
export function collapse(s: string): string {
  return s.split(/\s+/).filter(Boolean).join(' ')
}

/** An item's text as a turn sends it: collapsed and cut to 200 characters (CleanMemory). */
export function cleanMemory(s: string): string {
  const c = collapse(s)
  const chars = [...c]
  return chars.length > MAX_MEMORY_TEXT ? chars.slice(0, MAX_MEMORY_TEXT).join('') : c
}

/** Whether a row's text may be sent: plain, not a placeholder or ciphertext this device could not read. */
export function readable(text: string | undefined): boolean {
  return !!text && !!text.trim() && text !== UNDECRYPTABLE && !text.startsWith('enc:')
}

/** Live items in their order (position, then id). */
export function memoryOrder(list: readonly MemoryItem[]): MemoryItem[] {
  return list.filter((m) => !m.deleted_at).sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** This device's live items in order. */
export async function liveMemory(): Promise<MemoryItem[]> {
  return memoryOrder(await db.memories.toArray())
}

/** This device's live items in order, live (undefined while loading). */
export function useMemoryItems(): MemoryItem[] | undefined {
  return useLiveQuery(async () => memoryOrder(await db.memories.toArray()), [])
}

/** The texts a turn sends, in order (the device loop's half of D3). */
export async function memoryTexts(): Promise<string[]> {
  return (await liveMemory()).map((m) => m.text).filter(readable)
}

function checked(text: string, others: readonly MemoryItem[]): string {
  const clean = collapse(text)
  if (!clean || [...clean].length > MAX_MEMORY_TEXT) throw new MemoryError('invalid')
  if (others.some((m) => collapse(m.text).toLowerCase() === clean.toLowerCase())) throw new MemoryError('duplicate')
  return clean
}

const batch = (changes: { id: string; patch: Partial<MemoryItem>; create?: boolean }[], label: string): Promise<AssistantUndo | null> =>
  applyBatch(changes.map((c) => ({ entity: 'memory' as const, entityId: c.id, patch: c.patch, ...(c.create ? { create: true } : {}) })), { source: 'action', label })

/** Adds an item at the end. Throws MemoryError when full, empty, too long or already held. */
export async function addMemory(text: string, now = Date.now()): Promise<string> {
  const rows = await liveMemory()
  if (rows.length >= MAX_MEMORY_ITEMS) throw new MemoryError('full')
  const clean = checked(text, rows)
  const id = uuid()
  const position = Math.max(0, ...rows.map((m) => m.position)) + 1024
  await batch([{ id, create: true, patch: { text: clean, position, created_at: now, deleted_at: null } }], t('Memory added'))
  return id
}

/** Changes an item's text (the same text changes nothing). */
export async function editMemory(id: string, text: string): Promise<void> {
  const rows = await liveMemory()
  const row = rows.find((m) => m.id === id)
  if (!row) return
  const clean = checked(text, rows.filter((m) => m.id !== id))
  if (clean !== row.text) await batch([{ id, patch: { text: clean } }], t('Memory changed'))
}

/** Deletes an item (a tombstone); the entry undoes it. */
export async function deleteMemory(id: string, now = Date.now()): Promise<AssistantUndo | null> {
  return batch([{ id, patch: { deleted_at: now } }], t('Memory deleted'))
}

/** Deletes every live item in one batch; the entry undoes it. */
export async function clearMemory(now = Date.now()): Promise<AssistantUndo | null> {
  const rows = await liveMemory()
  return rows.length ? batch(rows.map((m) => ({ id: m.id, patch: { deleted_at: now } })), t('Memory cleared')) : null
}

/** Moves an item one place up (-1) or down (+1): one position write. */
export async function moveMemory(id: string, by: -1 | 1): Promise<void> {
  const rows = await liveMemory()
  const i = rows.findIndex((m) => m.id === id)
  const j = i + by
  if (i < 0 || j < 0 || j >= rows.length) return
  const rest = rows.filter((m) => m.id !== id)
  const before = rest[j - 1]?.position
  const after = rest[j]?.position
  const position = before === undefined ? (after ?? 1024) - 1024 : after === undefined ? before + 1024 : (before + after) / 2
  await batch([{ id, patch: { position } }], t('Memory moved'))
}
