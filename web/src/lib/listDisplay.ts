// Display options of a project's list, a label's page and the built-in Today,
// Upcoming and Inbox (OpenSpec changes list-display-options, builtin-view-options):
// the grouping, the order and its direction, the same choices a saved view offers,
// stored per project (in the user's personal project_prefs row), per label (on the
// label, which is personal) and per built-in view (in the user's user_prefs row), so
// the choice follows the user to every device and never reaches other members of a
// shared project. Read-time fallback like a view's: "" or a value this build does
// not know, or one the page does not offer, reads as the page's default and is never
// rewritten.
import { db } from './db'
import { mutate } from './ops'
import { rowLayoutOf, type RowLayout } from './rowLayout'
import { USER_PREFS_ID } from './userPrefs'
import { readSortBy, type GroupBy, type SortBy, type SortDir } from './types'

/** A list page's grouping: a view's choices plus the project's sections and Today's time of day. */
export type ListGroupBy = GroupBy | 'section' | 'day'

export interface ListDisplay {
  groupBy: ListGroupBy
  sortBy: SortBy
  sortDir: SortDir
  /** The rows' layout (row-layouts): the page's own choice, else the account's. */
  rowLayout: RowLayout
  /** Today and Upcoming (builtin-view-options D5): subtasks under their parent in the same group; absent where not offered. */
  subtasks?: boolean
  /** Upcoming's Later days (sidebar-brand-and-row-grid D8): every day in full; summarised otherwise; absent where not offered. */
  laterInFull?: boolean
}

/** The built-in lists with display options (builtin-view-options). */
export type BuiltinDisplayKind = 'today' | 'upcoming' | 'inbox'

/** Which page the options belong to. */
export type DisplayScope = { kind: 'project' | 'label'; id: string } | { kind: BuiltinDisplayKind }

/** Order by, as the panel lists them on a project or label page: manual first. */
export const LIST_SORT_OPTIONS: readonly SortBy[] = ['position', 'priority', 'due', 'created', 'deadline', 'title', 'urgency']
/** Today and Upcoming keep their own order rules: no manual order (builtin-view-options D2). */
export const DAY_SORT_OPTIONS: readonly SortBy[] = ['due', 'priority', 'created', 'deadline', 'title']
/** A project groups by its sections by default; projects make no sense inside one project. */
export const PROJECT_GROUP_OPTIONS: readonly ListGroupBy[] = ['section', 'none', 'due', 'priority', 'label']
/** A label page groups by project by default; its own label would be the only group. */
export const LABEL_GROUP_OPTIONS: readonly ListGroupBy[] = ['project', 'none', 'due', 'priority']

const SORT_DIRS: readonly SortDir[] = ['asc', 'desc']

interface DisplayKind {
  groups: readonly ListGroupBy[]
  sorts: readonly SortBy[]
  groupBy: ListGroupBy
  sortBy: SortBy
  /** Offers Nest subtasks. */
  nest?: true
  /** Offers Later days (Upcoming). */
  later?: true
  /** Custom-field orders are offered (not in the Inbox, whose tasks have no project). */
  fields: boolean
}

/** What each page offers and shows by default (list-display-options D2, builtin-view-options D2). */
export const DISPLAY_KINDS: Record<DisplayScope['kind'], DisplayKind> = {
  project: { groups: PROJECT_GROUP_OPTIONS, sorts: LIST_SORT_OPTIONS, groupBy: 'section', sortBy: 'position', fields: true },
  label: { groups: LABEL_GROUP_OPTIONS, sorts: LIST_SORT_OPTIONS, groupBy: 'project', sortBy: 'position', fields: true },
  today: { groups: ['day', 'project', 'priority', 'label', 'none'], sorts: DAY_SORT_OPTIONS, groupBy: 'day', sortBy: 'due', nest: true, fields: true },
  // Upcoming is its days: no Group by.
  upcoming: { groups: [], sorts: DAY_SORT_OPTIONS, groupBy: 'none', sortBy: 'due', nest: true, later: true, fields: true },
  inbox: { groups: ['none', 'due', 'priority', 'label'], sorts: LIST_SORT_OPTIONS, groupBy: 'none', sortBy: 'position', fields: false },
}

const isBuiltin = (kind: DisplayScope['kind']): kind is BuiltinDisplayKind => kind === 'today' || kind === 'upcoming' || kind === 'inbox'

/** A built-in view's options live in the user's preferences and can be reset. */
export const isBuiltinScope = (scope: DisplayScope): scope is { kind: BuiltinDisplayKind } => isBuiltin(scope.kind)

/** The stored field of each option: `group_by` on a project's prefs or a label, `today_group_by` in user_prefs. */
function fieldsOf(kind: DisplayScope['kind']) {
  const pre = isBuiltin(kind) ? `${kind}_` : ''
  return {
    groupBy: `${pre}group_by`, sortBy: `${pre}sort_by`, sortDir: `${pre}sort_dir`, rowLayout: `${pre}row_layout`,
    ...(DISPLAY_KINDS[kind].nest ? { subtasks: `${pre}subtasks` } : {}),
    ...(DISPLAY_KINDS[kind].later ? { laterInFull: `${pre}later` } : {}),
  } as Record<keyof ListDisplay, string>
}

/** The defaults: what the page showed before it had options. */
export function defaultListDisplay(kind: DisplayScope['kind'], rowLayout: RowLayout = 'line'): ListDisplay {
  const k = DISPLAY_KINDS[kind]
  return { groupBy: k.groupBy, sortBy: k.sortBy, sortDir: 'asc', rowLayout, ...(k.nest ? { subtasks: false } : {}), ...(k.later ? { laterInFull: false } : {}) }
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

/**
 * The options of a project's prefs row, a label row or (built-in views) the user's
 * prefs row; missing, unknown or not-offered values read as the default.
 */
export function listDisplayOf(kind: DisplayScope['kind'], row: object | null | undefined, account: RowLayout = 'line'): ListDisplay {
  const k = DISPLAY_KINDS[kind]
  const f = fieldsOf(kind)
  const r = (row ?? {}) as Record<string, unknown>
  const sortBy = readSortBy(r[f.sortBy], k.sorts, k.sortBy)
  return {
    rowLayout: rowLayoutOf(r[f.rowLayout], account),
    groupBy: pick(r[f.groupBy], k.groups, k.groupBy),
    sortBy: !k.fields && sortBy.startsWith('field:') ? k.sortBy : sortBy,
    sortDir: pick(r[f.sortDir], SORT_DIRS, 'asc'),
    ...(k.nest ? { subtasks: r[f.subtasks] === 'nested' } : {}),
    // An empty or unknown value reads as Summarised.
    ...(k.later ? { laterInFull: r[f.laterInFull] === 'full' } : {}),
  }
}

/**
 * The page shows what it showed before options existed: its own grouping, in its own
 * order. With `account`, the row layout and Nest subtasks count too (Reset, builtin-view-options D7).
 */
export function isDefaultDisplay(kind: DisplayScope['kind'], d: ListDisplay, account?: RowLayout): boolean {
  const def = defaultListDisplay(kind)
  const same = d.groupBy === def.groupBy && d.sortBy === def.sortBy && d.sortDir === 'asc'
  return account === undefined ? same : same && d.rowLayout === account && !d.subtasks && !d.laterInFull
}

/** The stored value of an option. */
function stored(key: keyof ListDisplay, value: ListDisplay[keyof ListDisplay]): string {
  if (key === 'laterInFull') return value ? 'full' : 'summary'
  return key === 'subtasks' ? (value ? 'nested' : '') : String(value)
}

function write(scope: DisplayScope, out: Record<string, string>): Promise<void> {
  if (scope.kind === 'project') return mutate('project_prefs', scope.id, out)
  if (scope.kind === 'label') return mutate('label', scope.id, out)
  return mutate('user_prefs', USER_PREFS_ID, out)
}

/**
 * Writes the changed options as ops (one per field, so a grouping changed on one
 * device and an order on another both survive). Works offline.
 */
export async function setListDisplay(scope: DisplayScope, patch: Partial<ListDisplay>): Promise<void> {
  const f = fieldsOf(scope.kind)
  const out: Record<string, string> = {}
  for (const key of Object.keys(patch) as (keyof ListDisplay)[]) {
    if (patch[key] !== undefined && f[key]) out[f[key]] = stored(key, patch[key])
  }
  if (Object.keys(out).length === 0) return
  await write(scope, out)
}

/** Reset (builtin-view-options D7): "" to every option of a built-in view that is not already empty, one op each. */
export async function resetListDisplay(scope: { kind: BuiltinDisplayKind }): Promise<void> {
  const row = (await db.userPrefs.get(USER_PREFS_ID)) as unknown as Record<string, unknown> | undefined
  const out: Record<string, string> = {}
  for (const field of Object.values(fieldsOf(scope.kind))) if (row?.[field]) out[field] = ''
  if (Object.keys(out).length === 0) return
  await mutate('user_prefs', USER_PREFS_ID, out)
}
