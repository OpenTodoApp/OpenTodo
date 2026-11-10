// Group and order from the keyboard (OpenSpec change display-keys): the `r` sequences
// change the same synced setting as the Display options panel of a project's list, a
// label's page or a saved view, through the same write, and say what they set in the
// toast (read by screen readers). A list registers only the choices its panel offers,
// so a key the page cannot use does nothing and the sequence spotlight leaves it out.
import { useRef } from 'react'
import { fieldSortOptions } from '../../lib/fieldSortOptions'
import { t } from '../../lib/i18n'
import type { ListGroupBy } from '../../lib/listDisplay'
import type { FieldDef, SortBy, SortDir } from '../../lib/types'
import { act } from '../actionError'
import { showUndoToast } from '../bulk/toastStore'
import { useShortcutScope, type ShortcutHandler } from '../shortcuts'
import { GROUP_LABEL, SORT_LABEL } from './DisplayPanel'

export interface DisplayChoice<G extends ListGroupBy = ListGroupBy> {
  groupBy: G
  sortBy: SortBy
  sortDir: SortDir
}

export interface DisplayKeysTarget<G extends ListGroupBy = ListGroupBy> {
  value: DisplayChoice<G>
  /** The Group by choices the panel offers here. */
  groupOptions: readonly G[]
  /** The Order by choices the panel offers here (custom fields stay in the panel). */
  sortOptions: readonly SortBy[]
  /** Custom field definitions, to name a custom-field order when it is reversed. */
  sortFields?: readonly FieldDef[]
  /** The panel's own write. */
  set: (patch: Partial<DisplayChoice<G>>) => Promise<void>
}

/** Registry id → the grouping it sets. */
export const GROUP_KEYS: Record<string, ListGroupBy> = {
  'arrange.group-section': 'section', 'arrange.group-project': 'project', 'arrange.group-none': 'none',
  'arrange.group-due': 'due', 'arrange.group-priority': 'priority', 'arrange.group-label': 'label', 'arrange.group-time': 'day',
}

/** Registry id → the order it sets. */
export const ORDER_KEYS: Record<string, SortBy> = {
  'arrange.order-manual': 'position', 'arrange.order-priority': 'priority', 'arrange.order-due': 'due',
  'arrange.order-created': 'created', 'arrange.order-deadline': 'deadline', 'arrange.order-title': 'title',
}

/** The direction as the panel words it. */
function directionText(sortBy: SortBy, dir: SortDir): string {
  if (sortBy === 'priority') return dir === 'desc' ? t('Descending (p1 first)') : t('Ascending (p4 first)')
  if (sortBy === 'urgency') return dir === 'desc' ? t('Least urgent first') : t('Most urgent first')
  return dir === 'desc' ? t('Descending') : t('Ascending')
}

function orderName(sortBy: SortBy, fields: readonly FieldDef[]): string {
  return SORT_LABEL[sortBy] ?? fieldSortOptions(fields, sortBy, t('Unavailable custom field')).find((o) => o.value === sortBy)?.label ?? sortBy
}

/** What the toast says after a change. */
export function displayAnnouncement(patch: Partial<DisplayChoice>, after: DisplayChoice, fields: readonly FieldDef[] = []): string {
  if (patch.groupBy !== undefined) return t('Group by: {name}', { name: GROUP_LABEL[after.groupBy] })
  return t('Order by: {name} · {direction}', { name: orderName(after.sortBy, fields), direction: directionText(after.sortBy, after.sortDir) })
}

/** The last keyed choice and the list's value it was made on (`r o p` then `r r` before the list shows the first write). */
export interface KeyedChoice { base: DisplayChoice; after: DisplayChoice }

const same = (a: DisplayChoice, b: DisplayChoice) => a.groupBy === b.groupBy && a.sortBy === b.sortBy && a.sortDir === b.sortDir

/** The handlers for the `arrange.*` registry ids this list offers. */
export function displayKeyHandlers<G extends ListGroupBy>(target: DisplayKeysTarget<G> | null, keyed: { current: KeyedChoice | null } = { current: null }): Partial<Record<string, ShortcutHandler>> {
  if (!target) return {}
  // Until the list shows a keyed write, the next key builds on that write, not on the value before it.
  const now = (): DisplayChoice<G> => (keyed.current && same(keyed.current.base, target.value) ? keyed.current.after as DisplayChoice<G> : target.value)
  const apply = (patch: Partial<DisplayChoice<G>>) => {
    const before = now()
    const after = { ...before, ...patch }
    if (!same(before, after)) {
      keyed.current = { base: target.value, after }
      act(target.set(patch))
    }
    showUndoToast(displayAnnouncement(patch, after, target.sortFields), null)
  }
  const out: Partial<Record<string, ShortcutHandler>> = {}
  for (const [id, groupBy] of Object.entries(GROUP_KEYS)) {
    const g = target.groupOptions.find((x) => x === groupBy)
    if (g !== undefined) out[id] = () => apply({ groupBy: g } as Partial<DisplayChoice<G>>)
  }
  for (const [id, sortBy] of Object.entries(ORDER_KEYS)) {
    if (target.sortOptions.includes(sortBy)) out[id] = () => apply({ sortBy })
  }
  out['arrange.reverse'] = () => apply({ sortDir: now().sortDir === 'desc' ? 'asc' : 'desc' })
  return out
}

/** Registers the `r` sequences while the list shows its Display options (`null` turns them off). */
export function useDisplayKeys<G extends ListGroupBy>(target: DisplayKeysTarget<G> | null): void {
  const keyed = useRef<KeyedChoice | null>(null)
  useShortcutScope('list', displayKeyHandlers(target, keyed), { enabled: !!target })
}
