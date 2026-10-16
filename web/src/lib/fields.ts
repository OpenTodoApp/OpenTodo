// Custom fields (OpenSpec `custom-fields`): definitions per project, typed values
// on tasks. Definitions are `field` entities written through mutate()/mutateMany()
// like sections (design D1); values are `fields.<id>` ops on the task, written as
// a partial `fields` map that mutateMany unfolds (design D2). Everything here is
// pure or goes through ops, so it works offline and converges.
import { db } from './db'
import { formatDate, type ResolvedDateTime, currentDateTime } from './dates'
import { mutate, mutateMany, type Change } from './ops'
import { byPosition, planStep, positionAtEnd } from './ordering'
import type { FieldDef, FieldType, FieldValue, Task } from './types'

/** The types a definition may have, in the order the dialog offers them. */
export const FIELD_TYPES: readonly { type: FieldType; label: string }[] = [
  { type: 'text', label: 'Text' },
  { type: 'number', label: 'Number' },
  { type: 'date', label: 'Date' },
  { type: 'choice', label: 'Choice' },
  { type: 'link', label: 'Link' },
  { type: 'checkbox', label: 'Checkbox' },
]

/** Limits shared with the REST API (internal/httpapi/fields.go). */
export const MAX_FIELDS = 30
export const MAX_FIELD_TEXT = 2000
export const MAX_OPTIONS = 50
export const MAX_OPTION_LEN = 100
export const MAX_FIELD_NAME = 100

/** A refused definition change; `field` names the input to focus. */
export class FieldError extends Error {
  constructor(message: string, public field: 'name' | 'options' | 'type' = 'name') {
    super(message)
    this.name = 'FieldError'
  }
}

/** A choice field's options: one per line, trimmed, blank lines ignored. */
export function parseOptions(options: string | null | undefined): string[] {
  return (options ?? '').split('\n').map((o) => o.trim()).filter(Boolean)
}

/** Live definitions of a project, in position order. Inbox (null) has none. */
export function liveFields(projectId: string | null | undefined, defs: readonly FieldDef[]): FieldDef[] {
  if (!projectId) return []
  return defs.filter((d) => d.project_id === projectId && !d.deleted_at).sort(byPosition)
}

/** Live definitions by lower-cased name, across every project (filter terms). */
export function fieldsByName(defs: readonly FieldDef[]): Map<string, FieldDef[]> {
  const out = new Map<string, FieldDef[]>()
  for (const d of defs) {
    if (d.deleted_at) continue
    const k = d.name.trim().toLocaleLowerCase()
    out.set(k, [...(out.get(k) ?? []), d])
  }
  return out
}

/** A task's values (rows synced before the change hold none). */
export function taskFields(task: Pick<Task, 'fields'>): Record<string, FieldValue> {
  return task.fields ?? {}
}

/** Whether a stored value fits its definition's type (spec "Value that no longer matches its definition"). */
export function matchesType(def: Pick<FieldDef, 'type' | 'options'>, value: FieldValue | undefined): boolean {
  if (value === null || value === undefined) return true
  switch (def.type) {
    case 'number': return typeof value === 'number' && Number.isFinite(value)
    case 'checkbox': return typeof value === 'boolean'
    case 'date': return typeof value === 'string' && validDate(value)
    case 'text': case 'link': case 'choice': return typeof value === 'string'
    default: return true
  }
}

function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** The decimal and group separators of a locale ("." and "," for en). */
export function numberSeparators(locale?: string): { decimal: string; group: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6)
  return {
    decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
    group: parts.find((p) => p.type === 'group')?.value ?? ',',
  }
}

/** Parse a number typed with the browser locale's decimal separator ("1.234,5" in de). */
export function parseLocaleNumber(input: string, locale?: string): number | null {
  const { decimal, group } = numberSeparators(locale)
  let s = input.trim().replace(/[\s  ]/g, '')
  if (!s) return null
  if (group && group !== decimal) s = s.split(group).join('')
  if (decimal !== '.') {
    // A dot typed in a comma locale is read as the decimal point when no comma is present.
    s = s.includes(decimal) ? s.split(decimal).join('.') : s
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export type Validation = { ok: true; value: FieldValue } | { ok: false; message: string }

/**
 * Check an editor's input against the definition's type (spec "Typed values and
 * their limits"). Text input is a string; a checkbox is a boolean. An empty input
 * clears the value (null).
 */
export function validateValue(def: Pick<FieldDef, 'type' | 'options'>, raw: string | boolean | number | null, locale?: string): Validation {
  if (raw === null) return { ok: true, value: null }
  if (def.type === 'checkbox') {
    if (typeof raw === 'boolean') return { ok: true, value: raw }
    return { ok: false, message: 'Choose on or off.' }
  }
  if (typeof raw === 'number') {
    if (def.type === 'number' && Number.isFinite(raw)) return { ok: true, value: raw }
    raw = String(raw)
  }
  if (typeof raw !== 'string') return { ok: false, message: 'Not a valid value.' }
  const s = def.type === 'text' ? raw : raw.trim()
  if (s.trim() === '') return { ok: true, value: null }
  switch (def.type) {
    case 'number': {
      const n = parseLocaleNumber(s, locale)
      return n === null ? { ok: false, message: 'Enter a number.' } : { ok: true, value: n }
    }
    case 'date':
      return validDate(s) ? { ok: true, value: s } : { ok: false, message: 'Enter a date.' }
    case 'choice':
      return parseOptions(def.options).includes(s) ? { ok: true, value: s } : { ok: false, message: 'Pick one of the options.' }
    case 'link': {
      if (s.length > MAX_FIELD_TEXT) return { ok: false, message: `At most ${MAX_FIELD_TEXT} characters.` }
      try {
        const u = new URL(s)
        if ((u.protocol === 'http:' || u.protocol === 'https:') && u.host) return { ok: true, value: s }
      } catch {
        // fall through
      }
      return { ok: false, message: 'Enter a link starting with http:// or https://.' }
    }
    default:
      if ([...s].length > MAX_FIELD_TEXT) return { ok: false, message: `At most ${MAX_FIELD_TEXT} characters.` }
      return { ok: true, value: s }
  }
}

/** A value as text: numbers with the locale's digit grouping, dates by the user's date format. */
export function formatValue(def: Pick<FieldDef, 'type'>, value: FieldValue | undefined, p: ResolvedDateTime = currentDateTime()): string {
  if (value === null || value === undefined || value === '') return ''
  if (def.type === 'number' && typeof value === 'number') return new Intl.NumberFormat(undefined, { maximumFractionDigits: 20 }).format(value)
  if (def.type === 'date' && typeof value === 'string' && validDate(value)) return formatDate(value, 'compact', p)
  if (def.type === 'checkbox' && typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

/**
 * The badges of a task (spec "Field badges on a card"): the non-empty values of
 * its project's live definitions in definition order. A checked checkbox reads as
 * its name, an unchecked one shows nothing.
 */
export function fieldBadges(task: Pick<Task, 'project_id' | 'fields'>, defs: readonly FieldDef[], p?: ResolvedDateTime): { def: FieldDef; text: string }[] {
  const values = taskFields(task)
  const out: { def: FieldDef; text: string }[] = []
  for (const def of liveFields(task.project_id, defs)) {
    const v = values[def.id]
    if (v === null || v === undefined || v === '' || v === false) continue
    out.push({ def, text: v === true && def.type === 'checkbox' ? def.name : `${def.name} ${formatValue(def, v, p)}` })
  }
  return out
}

/** How many live tasks hold a value for a definition (the delete confirmation). */
export function countValues(defId: string, tasks: readonly Task[]): number {
  let n = 0
  for (const t of tasks) {
    const v = t.fields?.[defId]
    if (!t.deleted_at && v !== null && v !== undefined && v !== '') n++
  }
  return n
}

// ---- definition ops (work offline, converge like sections) ----

/** Live definitions of a project from the local store. */
export async function projectFields(projectId: string): Promise<FieldDef[]> {
  return liveFields(projectId, await db.fields.where('project_id').equals(projectId).toArray())
}

function checkName(name: string, siblings: readonly FieldDef[], exceptId?: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new FieldError('A field needs a name.')
  if ([...trimmed].length > MAX_FIELD_NAME) throw new FieldError(`A name has at most ${MAX_FIELD_NAME} characters.`)
  const key = trimmed.toLocaleLowerCase()
  if (siblings.some((d) => d.id !== exceptId && d.name.trim().toLocaleLowerCase() === key)) {
    throw new FieldError(`This project already has a field named “${trimmed}”.`)
  }
  return trimmed
}

function checkOptions(options: string): string {
  const list = parseOptions(options)
  if (list.length > MAX_OPTIONS) throw new FieldError(`At most ${MAX_OPTIONS} options.`, 'options')
  if (list.some((o) => [...o].length > MAX_OPTION_LEN)) throw new FieldError(`An option has at most ${MAX_OPTION_LEN} characters.`, 'options')
  if (new Set(list).size !== list.length) throw new FieldError('Each option may appear once.', 'options')
  return list.join('\n')
}

/** Add a definition at the end of the project's fields. Returns its id. */
export async function createField(projectId: string, input: { name: string; type: FieldType; options?: string }): Promise<string> {
  const siblings = await projectFields(projectId)
  if (siblings.length >= MAX_FIELDS) throw new FieldError(`A project can have at most ${MAX_FIELDS} fields.`)
  const name = checkName(input.name, siblings)
  if (!FIELD_TYPES.some((t) => t.type === input.type)) throw new FieldError('Choose a type.', 'type')
  const options = input.type === 'choice' ? checkOptions(input.options ?? '') : ''
  if (input.type === 'choice' && !options) throw new FieldError('A choice field needs at least one option.', 'options')
  const id = crypto.randomUUID()
  await mutate('field', id, {
    name, project_id: projectId, type: input.type, options, position: positionAtEnd(siblings), created_at: Date.now(), deleted_at: null,
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
 * Change a choice field's options. `renamed` maps old option text to new text:
 * tasks of the project holding an old text are rewritten in the same batch, one
 * ordinary `fields.<id>` op each, so a concurrent edit resolves by last-writer-wins
 * (spec "Rename an option"). Returns the number of tasks rewritten.
 */
export async function setFieldOptions(id: string, options: string, renamed: Record<string, string> = {}): Promise<number> {
  const def = await db.fields.get(id)
  if (!def || def.deleted_at || def.type !== 'choice') return 0
  const next = checkOptions(options)
  if (!next) throw new FieldError('A choice field needs at least one option.', 'options')
  const changes: Change[] = []
  if (next !== def.options) changes.push({ entity: 'field', entityId: id, patch: { options: next } })
  const rename = new Map(Object.entries(renamed).filter(([from, to]) => from !== to && to.trim()))
  if (rename.size) {
    const tasks = await db.tasks.where('project_id').equals(def.project_id).filter((t) => !t.deleted_at).toArray()
    for (const t of tasks) {
      const v = t.fields?.[id]
      if (typeof v === 'string' && rename.has(v)) changes.push({ entity: 'task', entityId: t.id, patch: { fields: { [id]: rename.get(v)!.trim() } } })
    }
  }
  if (changes.length) await mutateMany(changes)
  return changes.filter((c) => c.entity === 'task').length
}

/** Move a definition up (-1) or down (+1) among its project's fields. */
export async function reorderField(id: string, delta: -1 | 1 | 'top' | 'bottom'): Promise<boolean> {
  const def = await db.fields.get(id)
  if (!def || def.deleted_at) return false
  const plan = planStep(await projectFields(def.project_id), id, delta)
  if (!plan) return false
  await mutateMany(plan.map((c) => ({ entity: 'field' as const, entityId: c.id, patch: { position: c.position } })))
  return true
}

/** Delete a definition: a tombstone only. Values stay in the tasks' data, hidden (spec). */
export async function deleteField(id: string): Promise<void> {
  const def = await db.fields.get(id)
  if (!def || def.deleted_at) return
  await mutate('field', id, { deleted_at: Date.now() })
}

/** Set one value of a task (null clears); one `fields.<id>` op, nothing else touched. */
export async function setFieldValue(taskId: string, defId: string, value: FieldValue): Promise<void> {
  await mutate('task', taskId, { fields: { [defId]: value } })
}
