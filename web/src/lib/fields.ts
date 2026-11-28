// Custom fields (OpenSpec `custom-fields`): definitions per project or per
// workspace (`workspace-fields`), typed values
// on tasks. Definitions are `field` entities written through mutate()/mutateMany()
// like sections (design D1); values are `fields.<id>` ops on the task, written as
// a partial `fields` map that mutateMany unfolds (design D2). Everything here is
// pure or goes through ops, so it works offline and converges.
import { db } from './db'
import { formatDate, type ResolvedDateTime, currentDateTime } from './dates'
import { mutate, mutateMany, type Change } from './ops'
import { planStep, positionAtEnd } from './ordering'
import { applicableFields, fieldDescendants, fieldPlace, fieldWorkspace, isWorkspaceField, liveFields, workspaceFields, type FieldPlacement } from './fieldTree'
import type { FieldDef, FieldType, FieldValue, Project, Task, Workspace } from './types'
import { Partition, workspaceLabel } from './workspaces'
import { currentLocale, t, msg, translatedList } from './i18n'
import { uuid } from './ids'

/** The types a definition may have, in the order the dialog offers them. */
export const FIELD_TYPES: readonly { type: FieldType; label: string }[] = translatedList<{ type: FieldType; label: string }, 'label'>([
  { type: 'text', label: msg('Text') },
  { type: 'number', label: msg('Number') },
  { type: 'date', label: msg('Date') },
  { type: 'choice', label: msg('Choice') },
  { type: 'link', label: msg('Link') },
  { type: 'checkbox', label: msg('Checkbox') },
], 'label')

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
    return { ok: false, message: t('Choose on or off.') }
  }
  if (typeof raw === 'number') {
    if (def.type === 'number' && Number.isFinite(raw)) return { ok: true, value: raw }
    raw = String(raw)
  }
  if (typeof raw !== 'string') return { ok: false, message: t('Not a valid value.') }
  const s = def.type === 'text' ? raw : raw.trim()
  if (s.trim() === '') return { ok: true, value: null }
  switch (def.type) {
    case 'number': {
      const n = parseLocaleNumber(s, locale)
      return n === null ? { ok: false, message: t('Enter a number.') } : { ok: true, value: n }
    }
    case 'date':
      return validDate(s) ? { ok: true, value: s } : { ok: false, message: t('Enter a date.') }
    case 'choice':
      return parseOptions(def.options).includes(s) ? { ok: true, value: s } : { ok: false, message: t('Pick one of the options.') }
    case 'link': {
      if (s.length > MAX_FIELD_TEXT) return { ok: false, message: t('At most {n} characters.', { n: MAX_FIELD_TEXT }) }
      try {
        const u = new URL(s)
        if ((u.protocol === 'http:' || u.protocol === 'https:') && u.host) return { ok: true, value: s }
      } catch {
        // fall through
      }
      return { ok: false, message: t('Enter a link starting with http:// or https://.') }
    }
    default:
      if ([...s].length > MAX_FIELD_TEXT) return { ok: false, message: t('At most {n} characters.', { n: MAX_FIELD_TEXT }) }
      return { ok: true, value: s }
  }
}

/** A value as text: numbers with the locale's digit grouping, dates by the user's date format. */
export function formatValue(def: Pick<FieldDef, 'type'>, value: FieldValue | undefined, p: ResolvedDateTime = currentDateTime()): string {
  if (value === null || value === undefined || value === '') return ''
  if (def.type === 'number' && typeof value === 'number') return new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: 20 }).format(value)
  if (def.type === 'date' && typeof value === 'string' && validDate(value)) return formatDate(value, 'compact', p)
  if (def.type === 'checkbox' && typeof value === 'boolean') return value ? t('Yes') : t('No')
  return String(value)
}

/**
 * The badges of a task (spec "Field badges on a card"): the non-empty values of
 * its project's live definitions in definition order. A checked checkbox reads as
 * its name, an unchecked one shows nothing.
 */
export function fieldBadges(task: Pick<Task, 'project_id' | 'fields'>, defs: readonly FieldDef[], p?: ResolvedDateTime, fieldsOf?: (projectId: string | null | undefined) => FieldDef[]): { def: FieldDef; text: string }[] {
  const values = taskFields(task)
  const out: { def: FieldDef; text: string }[] = []
  // With a lookup (inherited-custom-fields) the badges include the fields the project inherits.
  for (const def of fieldsOf ? fieldsOf(task.project_id) : liveFields(task.project_id, defs)) {
    const v = values[def.id]
    if (v === null || v === undefined || v === '' || v === false) continue
    out.push({ def, text: v === true && def.type === 'checkbox' ? def.name : `${def.name} ${formatValue(def, v, p)}` })
  }
  return out
}

/** How many live tasks hold a value for a definition (the delete confirmation). */
export function countValues(defId: string, tasks: readonly Task[]): number {
  let n = 0
  for (const task of tasks) {
    const v = task.fields?.[defId]
    if (!task.deleted_at && v !== null && v !== undefined && v !== '') n++
  }
  return n
}

// ---- definition ops (work offline, converge like sections) ----

/** Live definitions of a project from the local store. */
export async function projectFields(projectId: string): Promise<FieldDef[]> {
  return liveFields(projectId, await db.fields.where('project_id').equals(projectId).toArray())
}

/** What the checks across a project tree and a workspace read (inherited-custom-fields, workspace-fields). */
interface FieldTree { projects: Project[]; defs: FieldDef[]; place: FieldPlacement; workspaces: Workspace[] }

/** The live projects, every definition row and where each project is. */
async function fieldTree(): Promise<FieldTree> {
  const [projects, defs, workspaces, memberships] = await Promise.all([db.projects.toArray(), db.fields.toArray(), db.workspaces.toArray(), db.memberships.toArray()])
  const partition = new Partition(workspaces.find((w) => w.default)?.id ?? '', workspaces.map((w) => w.id), projects)
  // The person's own projects in a workspace they own (workspace-fields D2).
  const place = fieldPlace(partition, workspaces.filter((w) => w.role === 'owner').map((w) => w.id), memberships.filter((m) => m.role !== 'owner').map((m) => m.projectId))
  return { projects: projects.filter((p) => !p.deleted_at), defs, place, workspaces }
}

/** The live fields of one workspace from the local store (workspace-fields), in position order. */
export async function workspaceFieldsOf(workspaceId: string): Promise<FieldDef[]> {
  const tree = await fieldTree()
  return workspaceFields(workspaceId, tree.place, tree.defs)
}

/** The live projects of one workspace. */
function projectsOf(workspaceId: string, tree: FieldTree): Project[] {
  return tree.projects.filter((p) => tree.place.project(p.id) === workspaceId)
}

const sameName = (d: FieldDef, key: string) => d.name.trim().toLocaleLowerCase() === key

/**
 * A field name for `projectId` (inherited-custom-fields "Names and limits across a
 * project tree"): unique, ignoring case, among the fields that apply to the
 * project (its own and the inherited ones) and among the own fields of every
 * sub-project at any depth.
 */
function checkName(name: string, projectId: string, tree: FieldTree, exceptId?: string): string {
  const trimmed = nameShape(name)
  const key = trimmed.toLocaleLowerCase()
  const nameOf = (pid: string) => tree.projects.find((p) => p.id === pid)?.name ?? ''
  for (const d of applicableFields(projectId, tree.projects, tree.defs, tree.place)) {
    if (d.id === exceptId || !sameName(d, key)) continue
    if (isWorkspaceField(d)) {
      const ws = tree.workspaces.find((w) => w.id === fieldWorkspace(d, tree.place))
      throw new FieldError(t('This project already has a field named “{name}” from “{workspace}”.', { name: trimmed, workspace: ws ? workspaceLabel(ws.name, ws.default) : '' }))
    }
    if (d.project_id === projectId) throw new FieldError(t('This project already has a field named “{name}”.', { name: trimmed }))
    throw new FieldError(t('This project already inherits a field named “{name}” from “{project}”.', { name: trimmed, project: nameOf(d.project_id) }))
  }
  for (const pid of fieldDescendants(projectId, tree.projects)) {
    if (liveFields(pid, tree.defs).some((d) => d.id !== exceptId && sameName(d, key))) {
      throw new FieldError(t('The sub-project “{project}” already has a field named “{name}”.', { name: trimmed, project: nameOf(pid) }))
    }
  }
  return trimmed
}

/** A trimmed, non-empty name of at most MAX_FIELD_NAME characters. */
function nameShape(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new FieldError(t('A field needs a name.'))
  if ([...trimmed].length > MAX_FIELD_NAME) throw new FieldError(t('A name has at most {n} characters.', { n: MAX_FIELD_NAME }))
  return trimmed
}

/**
 * A workspace field's name (workspace-fields "Names and limits across a
 * workspace"): unique, ignoring case, among the workspace's fields and the own
 * fields of every project in it.
 */
function checkWorkspaceName(name: string, workspaceId: string, tree: FieldTree, exceptId?: string): string {
  const trimmed = nameShape(name)
  const key = trimmed.toLocaleLowerCase()
  if (workspaceFields(workspaceId, tree.place, tree.defs).some((d) => d.id !== exceptId && sameName(d, key))) {
    throw new FieldError(t('This workspace already has a field named “{name}”.', { name: trimmed }))
  }
  for (const p of projectsOf(workspaceId, tree)) {
    if (liveFields(p.id, tree.defs).some((d) => d.id !== exceptId && sameName(d, key))) {
      throw new FieldError(t('The project “{project}” already has a field named “{name}”.', { name: trimmed, project: p.name }))
    }
  }
  return trimmed
}

/** Only a workspace's owner changes its fields (workspace-fields D1). */
function checkOwner(workspaceId: string, tree: FieldTree): void {
  if (!tree.place.owns(workspaceId)) throw new FieldError(t('Only the workspace’s owner can change its fields.'))
}

/** The 30-field limit counts a workspace's fields on every project of the workspace. */
function checkWorkspaceLimit(workspaceId: string, tree: FieldTree): void {
  if (workspaceFields(workspaceId, tree.place, tree.defs).length >= MAX_FIELDS) throw new FieldError(t('A workspace can have at most {n} fields.', { n: MAX_FIELDS }))
  for (const p of projectsOf(workspaceId, tree)) {
    if (applicableFields(p.id, tree.projects, tree.defs, tree.place).length >= MAX_FIELDS) {
      throw new FieldError(t('The project “{project}” would have more than {n} fields.', { n: MAX_FIELDS, project: p.name }))
    }
  }
}

/** The 30-field limit counts workspace and inherited fields, for the project and every sub-project below it. */
function checkLimit(projectId: string, tree: FieldTree): void {
  if (applicableFields(projectId, tree.projects, tree.defs, tree.place).length >= MAX_FIELDS) throw new FieldError(t('A project can have at most {n} fields.', { n: MAX_FIELDS }))
  for (const pid of fieldDescendants(projectId, tree.projects)) {
    if (applicableFields(pid, tree.projects, tree.defs, tree.place).length >= MAX_FIELDS) {
      throw new FieldError(t('The sub-project “{project}” would have more than {n} fields.', { n: MAX_FIELDS, project: tree.projects.find((p) => p.id === pid)?.name ?? '' }))
    }
  }
}

function checkOptions(options: string): string {
  const list = parseOptions(options)
  if (list.length > MAX_OPTIONS) throw new FieldError(t('At most {n} options.', { n: MAX_OPTIONS }), 'options')
  if (list.some((o) => [...o].length > MAX_OPTION_LEN)) throw new FieldError(t('An option has at most {n} characters.', { n: MAX_OPTION_LEN }), 'options')
  if (new Set(list).size !== list.length) throw new FieldError(t('Each option may appear once.'), 'options')
  return list.join('\n')
}

/** Add a definition at the end of the project's fields. Returns its id. */
export async function createField(projectId: string, input: { name: string; type: FieldType; options?: string }): Promise<string> {
  const siblings = await projectFields(projectId)
  const tree = await fieldTree()
  checkLimit(projectId, tree)
  const name = checkName(input.name, projectId, tree)
  if (!FIELD_TYPES.some((item) => item.type === input.type)) throw new FieldError(t('Choose a type.'), 'type')
  const options = input.type === 'choice' ? checkOptions(input.options ?? '') : ''
  if (input.type === 'choice' && !options) throw new FieldError(t('A choice field needs at least one option.'), 'options')
  const id = uuid()
  await mutate('field', id, {
    name, project_id: projectId, type: input.type, options, position: positionAtEnd(siblings), created_at: Date.now(), deleted_at: null,
  })
  return id
}

/**
 * Add a field to a workspace the user owns (workspace-fields D1), at the end of
 * its fields: no project, so it lives in the personal scope and applies to every
 * project of the workspace. The default workspace is written as null. Returns its id.
 */
export async function createWorkspaceField(workspace: Pick<Workspace, 'id' | 'default'>, input: { name: string; type: FieldType; options?: string }): Promise<string> {
  const tree = await fieldTree()
  checkOwner(workspace.id, tree)
  checkWorkspaceLimit(workspace.id, tree)
  const name = checkWorkspaceName(input.name, workspace.id, tree)
  if (!FIELD_TYPES.some((item) => item.type === input.type)) throw new FieldError(t('Choose a type.'), 'type')
  const options = input.type === 'choice' ? checkOptions(input.options ?? '') : ''
  if (input.type === 'choice' && !options) throw new FieldError(t('A choice field needs at least one option.'), 'options')
  const id = uuid()
  // No project_id op: an empty id is the default and the server refuses it written.
  await mutate('field', id, {
    name, workspace_id: workspace.default ? null : workspace.id, type: input.type, options,
    position: positionAtEnd(workspaceFields(workspace.id, tree.place, tree.defs)), created_at: Date.now(), deleted_at: null,
  })
  return id
}

export async function renameField(id: string, name: string): Promise<void> {
  const def = await db.fields.get(id)
  if (!def || def.deleted_at) return
  const tree = await fieldTree()
  if (isWorkspaceField(def)) checkOwner(fieldWorkspace(def, tree.place), tree)
  const trimmed = isWorkspaceField(def) ? checkWorkspaceName(name, fieldWorkspace(def, tree.place), tree, id) : checkName(name, def.project_id, tree, id)
  if (trimmed !== def.name) await mutate('field', id, { name: trimmed })
}

/** The live tasks that can hold a definition's values: its project's and sub-projects', or its workspace's projects'. */
async function tasksHolding(def: FieldDef): Promise<Task[]> {
  const tree = await fieldTree()
  const scope = isWorkspaceField(def)
    ? projectsOf(fieldWorkspace(def, tree.place), tree).map((p) => p.id)
    : [def.project_id, ...fieldDescendants(def.project_id, tree.projects)]
  return db.tasks.where('project_id').anyOf(scope).filter((task) => !task.deleted_at).toArray()
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
  if (!next) throw new FieldError(t('A choice field needs at least one option.'), 'options')
  const changes: Change[] = []
  if (next !== def.options) changes.push({ entity: 'field', entityId: id, patch: { options: next } })
  const rename = new Map(Object.entries(renamed).filter(([from, to]) => from !== to && to.trim()))
  if (rename.size) {
    // Values live in the defining project and in every sub-project that inherits
    // the field, or in every project of the defining workspace.
    for (const tk of await tasksHolding(def)) {
      const v = tk.fields?.[id]
      if (typeof v === 'string' && rename.has(v)) changes.push({ entity: 'task', entityId: tk.id, patch: { fields: { [id]: rename.get(v)!.trim() } } })
    }
  }
  if (changes.length) await mutateMany(changes)
  return changes.filter((c) => c.entity === 'task').length
}

/** Move a definition up (-1) or down (+1) among its project's fields. */
export async function reorderField(id: string, delta: -1 | 1 | 'top' | 'bottom'): Promise<boolean> {
  const def = await db.fields.get(id)
  if (!def || def.deleted_at) return false
  const siblings = isWorkspaceField(def) ? await workspaceFieldsOf(fieldWorkspace(def, (await fieldTree()).place)) : await projectFields(def.project_id)
  const plan = planStep(siblings, id, delta)
  if (!plan) return false
  await mutateMany(plan.map((c) => ({ entity: 'field' as const, entityId: c.id, patch: { position: c.position } })))
  return true
}

export { fieldValueLabel, rememberFieldNames } from './fieldNames'
export { applicableFields, applicableFieldsLookup, fieldChain, fieldDescendants, fieldPlace, fieldWorkspace, isWorkspaceField, liveFields, workspaceFields, type FieldPlacement, type FieldProject } from './fieldTree'

/** Set one value of a task (null clears); one `fields.<id>` op, nothing else touched. */
export async function setFieldValue(taskId: string, defId: string, value: FieldValue): Promise<void> {
  await mutate('task', taskId, { fields: { [defId]: value } })
}
