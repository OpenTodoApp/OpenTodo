// Custom fields (OpenSpec custom-fields, design D5): definitions per project and
// typed values on tasks. Every write goes through mutate()/mutateMany(): a
// definition is a `field` entity, a value is one "fields.<id>" op on the task.
import { formatDate } from './dates'
import { db } from './db'
import { mutate, mutateMany, type Change } from './ops'
import { byPosition, planStep, positionAtEnd } from './ordering'
import type { FieldDef, FieldType, FieldValue, Task } from './types'

export const FIELD_TYPES: readonly FieldType[] = ['text', 'number', 'date', 'choice', 'link', 'checkbox']
/** Limits checked by the dialog, the REST API and the tools (not by sync). */
export const MAX_FIELDS = 30
export const MAX_OPTIONS = 50
export const MAX_OPTION_LENGTH = 100
export const MAX_NAME_LENGTH = 60

export class FieldError extends Error {}

/** Choice options from the stored text: one per line, trimmed, empty lines dropped. */
export function parseOptions(options: string): string[] {
  return options.split('\n').map((o) => o.trim()).filter(Boolean)
}

function checkOptions(list: string[]): void {
  if (list.length > MAX_OPTIONS) throw new FieldError(`A choice field has at most ${MAX_OPTIONS} options.`)
  const long = list.find((o) => o.length > MAX_OPTION_LENGTH)
  if (long) throw new FieldError(`An option has at most ${MAX_OPTION_LENGTH} characters.`)
  const seen = new Set<string>()
  for (const o of list) {
    const k = o.toLowerCase()
    if (seen.has(k)) throw new FieldError(`The option "${o}" is listed twice.`)
    seen.add(k)
  }
}

export type ValidationResult = { ok: true; value: FieldValue } | { ok: false; message: string }

/**
 * Turn an editor's raw input into a stored value for `def`: numbers parsed with
 * the given decimal separator, dates as YYYY-MM-DD, choices one of the options,
 * links http(s) only, checkboxes booleans. Empty input clears the value (null).
 */
export function validateValue(def: Pick<FieldDef, 'type' | 'options'>, raw: unknown, decimal = '.'): ValidationResult {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null }
  switch (def.type) {
    case 'checkbox':
      return typeof raw === 'boolean' ? { ok: true, value: raw } : { ok: false, message: 'Choose yes or no.' }
    case 'number': {
      if (typeof raw === 'number') return Number.isFinite(raw) ? { ok: true, value: raw } : { ok: false, message: 'Enter a number.' }
      const s = String(raw).trim().replace(/\s/g, '')
      const normalized = decimal === ',' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
      const n = Number(normalized)
      return normalized !== '' && Number.isFinite(n) ? { ok: true, value: n } : { ok: false, message: 'Enter a number.' }
    }
    case 'date': {
      const s = String(raw).trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, message: 'Enter a date.' }
      const [y, m, d] = s.split('-').map(Number)
      const dt = new Date(Date.UTC(y, m - 1, d))
      return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? { ok: true, value: s } : { ok: false, message: 'Enter a date.' }
    }
    case 'choice': {
      const s = String(raw).trim()
      const option = parseOptions(def.options).find((o) => o.toLowerCase() === s.toLowerCase())
      return option ? { ok: true, value: option } : { ok: false, message: 'Pick one of the options.' }
    }
    case 'link': {
      const s = String(raw).trim()
      try {
        const u = new URL(s)
        if ((u.protocol === 'http:' || u.protocol === 'https:') && s.length <= 2000) return { ok: true, value: s }
      } catch {
        // falls through
      }
      return { ok: false, message: 'Enter a web address starting with http:// or https://.' }
    }
    default: {
      const s = String(raw)
      return s.length > 2000 ? { ok: false, message: 'At most 2,000 characters.' } : { ok: true, value: s }
    }
  }
}

/** Whether a stored value matches its definition's type (readers tolerate a mismatch). */
export function matchesType(def: Pick<FieldDef, 'type' | 'options'>, value: FieldValue): boolean {
  if (value === null) return true
  const r = validateValue(def, value)
  return r.ok && r.value === value
}

const numberFormats = new Map<string, Intl.NumberFormat>()

/** A value as shown on badges, columns and the panel; a mismatch shows as plain text. */
export function formatValue(def: Pick<FieldDef, 'type' | 'options'>, value: FieldValue, locale?: string): string {
  if (value === null || value === undefined || value === '') return ''
  if (def.type === 'number' && typeof value === 'number') {
    const key = locale ?? ''
    let f = numberFormats.get(key)
    if (!f) numberFormats.set(key, (f = new Intl.NumberFormat(locale)))
    return f.format(value)
  }
  if (def.type === 'checkbox' && typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (def.type === 'date' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value, 'compact')
  return String(value)
}

/** The live definitions of a project, in display order. */
export function liveFields(projectId: string | null | undefined, defs: readonly FieldDef[]): FieldDef[] {
  if (!projectId) return []
  return defs.filter((d) => d.project_id === projectId && !d.deleted_at).sort(byPosition)
}

/** Live definitions by lower-cased name, across projects (filters match names). */
export function fieldsByName(defs: readonly FieldDef[]): Map<string, FieldDef[]> {
  const out = new Map<string, FieldDef[]>()
  for (const d of defs) {
    if (d.deleted_at) continue
    const k = d.name.trim().toLowerCase()
    out.set(k, [...(out.get(k) ?? []), d])
  }
  return out
}

async function projectFields(projectId: string): Promise<FieldDef[]> {
  return liveFields(projectId, await db.fields.where('project_id').equals(projectId).toArray())
}

function checkName(name: string, siblings: readonly FieldDef[], exceptId?: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new FieldError('A field needs a name.')
  if (trimmed.length > MAX_NAME_LENGTH) throw new FieldError(`A field name has at most ${MAX_NAME_LENGTH} characters.`)
  if (siblings.some((d) => d.id !== exceptId && d.name.trim().toLowerCase() === trimmed.toLowerCase())) {
    throw new FieldError(`This project already has a field named "${trimmed}".`)
  }
  return trimmed
}

/** A new field goes last in its project; at most 30 per project, names unique ignoring case. */
export async function createField(projectId: string, input: { name: string; type: FieldType; options?: string }): Promise<string> {
  const siblings = await projectFields(projectId)
  if (siblings.length >= MAX_FIELDS) throw new FieldError(`A project has at most ${MAX_FIELDS} fields.`)
  const name = checkName(input.name, siblings)
  if (!FIELD_TYPES.includes(input.type)) throw new FieldError('Unknown field type.')
  const options = input.type === 'choice' ? parseOptions(input.options ?? '') : []
  checkOptions(options)
  const id = crypto.randomUUID()
  await mutate('field', id, {
    name, project_id: projectId, type: input.type, options: options.join('\n'), position: positionAtEnd(siblings), created_at: Date.now(), deleted_at: null,
  })
  return id
}

export async function renameField(id: string, name: string): Promise<void> {
  const def = await db.fields.get(id)
  if (!def || def.deleted_at) return
  const trimmed = checkName(name, await projectFields(def.project_id), id)
  if (trimmed !== def.name) await mutate('field', id, { name: trimmed })
}

/**
 * Replace a choice field's options. `renames` maps an old option text to its new
 * text: the project's tasks holding the old text are rewritten in the same
 * batch, one op per task, so values follow the rename.
 */
export async function setFieldOptions(id: string, options: string[], renames: Record<string, string> = {}): Promise<void> {
  const def = await db.fields.get(id)
  if (!def || def.deleted_at || def.type !== 'choice') return
  const list = options.map((o) => o.trim()).filter(Boolean)
  checkOptions(list)
  const changes: Change[] = [{ entity: 'field', entityId: id, patch: { options: list.join('\n') } }]
  const pairs = Object.entries(renames).filter(([from, to]) => from !== to)
  if (pairs.length) {
    const tasks = await db.tasks.where('project_id').equals(def.project_id).filter((t) => !t.deleted_at).toArray()
    for (const t of tasks) {
      const v = (t.fields ?? {})[id]
      const hit = pairs.find(([from]) => typeof v === 'string' && v === from)
      if (hit) changes.push({ entity: 'task', entityId: t.id, patch: { fields: { [id]: hit[1] } } })
    }
  }
  await mutateMany(changes)
}

export async function reorderField(id: string, delta: -1 | 1 | 'top' | 'bottom'): Promise<boolean> {
  const def = await db.fields.get(id)
  if (!def || def.deleted_at) return false
  const plan = planStep(await projectFields(def.project_id), id, delta)
  if (!plan) return false
  await mutateMany(plan.map((c) => ({ entity: 'field' as const, entityId: c.id, patch: { position: c.position } })))
  return true
}

/** Delete a definition: its values stay on the tasks, hidden (a later undo or export keeps them). */
export async function deleteField(id: string): Promise<void> {
  const def = await db.fields.get(id)
  if (!def || def.deleted_at) return
  await mutate('field', id, { deleted_at: Date.now() })
}

/** How many live tasks hold a value of the field (the delete confirmation states it). */
export async function tasksWithValue(id: string): Promise<number> {
  const def = await db.fields.get(id)
  if (!def) return 0
  return db.tasks.where('project_id').equals(def.project_id).filter((t: Task) => !t.deleted_at && (t.fields ?? {})[id] != null).count()
}

/**
 * A row's badges (custom-fields "Board view"): the non-empty values in definition
 * order, "Name value" (a checked box reads as its name), at most three shown and
 * the rest named for the "+n" badge's accessible name.
 */
export function fieldBadges(defs: readonly Pick<FieldDef, 'id' | 'name' | 'type' | 'options'>[], values: Record<string, FieldValue> | undefined, max = 3): { shown: { id: string; text: string }[]; rest: string[] } {
  const all: { id: string; text: string }[] = []
  for (const d of defs) {
    const v = values?.[d.id]
    if (v === null || v === undefined || v === '' || v === false) continue
    all.push({ id: d.id, text: d.type === 'checkbox' ? d.name : `${d.name} ${formatValue(d, v)}` })
  }
  return { shown: all.slice(0, max), rest: all.slice(max).map((b) => b.text) }
}
