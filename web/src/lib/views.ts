// Saved views (OpenSpec change `custom-views`): named filter queries with grouping
// and sort options, pinned to the sidebar, composed into dashboards. Every write is
// an op through mutate(); evaluation reuses the filter compiler from lib/filter.
import { VIEW_DEFAULTS } from './ops'
import {
  GROUP_BY_OPTIONS, SORT_BY_OPTIONS, SORT_DIR_OPTIONS, VIEW_KINDS,
  type GroupBy, type SortBy, type SortDir, type View, type ViewKind,
} from './types'

export interface ViewOptions {
  kind: ViewKind
  groupBy: GroupBy
  sortBy: SortBy
  sortDir: SortDir
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

/**
 * The view's options with values this build does not know (sent by a newer client)
 * mapped to the defaults. Read-time only: the stored row is never rewritten, so the
 * newer client keeps its value and every replica still converges on the same ops.
 */
export function viewOptions(v: Pick<View, 'kind' | 'group_by' | 'sort_by' | 'sort_dir'>): ViewOptions {
  return {
    kind: pick(v.kind, VIEW_KINDS, VIEW_DEFAULTS.kind as ViewKind),
    groupBy: pick(v.group_by, GROUP_BY_OPTIONS, VIEW_DEFAULTS.group_by as GroupBy),
    sortBy: pick(v.sort_by, SORT_BY_OPTIONS, VIEW_DEFAULTS.sort_by as SortBy),
    sortDir: pick(v.sort_dir, SORT_DIR_OPTIONS, VIEW_DEFAULTS.sort_dir as SortDir),
  }
}
