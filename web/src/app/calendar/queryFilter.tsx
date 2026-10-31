// The query filter of the Calendar and of Upcoming (OpenSpec change calendar-clarity,
// design D4): one query in the filter language per place, remembered on this device
// (device meta, never synced) and evaluated on local rows, so it works offline and on
// unlocked encrypted accounts. An active query is one chip in the header's lead line;
// Filter… opens the dialog, which loads only when it is first asked for.
import { lazy, Suspense, useCallback, useMemo } from 'react'
import { compile, parse, type FilterContext } from '../../lib/filter'
import { t } from '../../lib/i18n'
import { useAllLabels, useAllProjects, useMeta } from '../../lib/localData'
import { CALENDAR_FILTER_KEY, saveQueryFilter, UPCOMING_FILTER_KEY } from '../../lib/deviceFilters'
import type { Task } from '../../lib/types'
import { Icon } from '../../ui'
import { act } from '../actionError'
import { PanelBoundary } from '../PanelBoundary'
import { queryChips } from '../views/FilterChips'
import { useToday } from '../useViews'

export { CALENDAR_FILTER_KEY, UPCOMING_FILTER_KEY }

const QueryFilterDialog = lazy(() => import('./QueryFilterDialog'))

/** The error of a query in `ctx` (a syntax error or a field term its type cannot answer), or null when it can be used. */
export function queryError(query: string, ctx: FilterContext): string | null {
  try {
    const ast = parse(query)
    if (ast) compile(ast, ctx)
    return null
  } catch (e) {
    const err = e as { message?: string; offset?: number }
    if (typeof err.offset !== 'number') throw e
    return err.message ?? t('Invalid query')
  }
}

export interface QueryFilter {
  /** The active query ("" when none). */
  query: string
  /** The predicate of the active query, or null when no filter is on. */
  test: ((task: Task) => boolean) | null
  /** The context queries are checked and evaluated in. */
  ctx: FilterContext
  setQuery: (query: string) => void
}

/** The filter stored under `key`, compiled against the live labels and projects; `tasks` answer `blocked` and friends. */
export function useQueryFilter(key: string, tasks: readonly Task[]): QueryFilter {
  const stored = useMeta<unknown>(key, '')
  const query = typeof stored === 'string' ? stored : ''
  const labels = useAllLabels()
  const projects = useAllProjects()
  const today = useToday()
  const ctx = useMemo<FilterContext>(() => ({ today, labels, projects, tasks }), [today, labels, projects, tasks])
  const test = useMemo(() => {
    if (!query.trim()) return null
    try {
      const ast = parse(query)
      return ast ? compile(ast, ctx).test : null
    } catch {
      // A query that no longer compiles (a field removed since) filters nothing out.
      return null
    }
  }, [query, ctx])
  const setQuery = useCallback((q: string) => act(saveQueryFilter(key, q)), [key])
  return { query, test, ctx, setQuery }
}

/** The active filter in the header's lead line: its words, a clear control; the words reopen the filter. */
export function FilterQueryChip({ query, onOpen, onClear }: { query: string; onOpen: () => void; onClear: () => void }) {
  const words = useMemo(() => queryChips(query).map((c) => (c.not ? `${t('Not')} ${c.text}` : c.text)).join(', ') || query, [query])
  return (
    // The duration filter's chip, with the query's words (design D4).
    <span className="inline-flex min-w-0 max-w-72 items-center gap-1 rounded-full border border-accent bg-accent-soft py-0.5 pl-2.5 pr-1 text-meta font-medium text-on-accent-soft" data-query-filter-chip>
      <button type="button" onClick={onOpen} className="flex min-h-6 min-w-0 items-center gap-1" aria-label={t('Filter: {words}. Edit the filter', { words })}>
        <Icon name="filter" size="xs" className="shrink-0" />
        <span aria-hidden className="min-w-0 truncate">{words}</span>
      </button>
      <button type="button" className="touch-target flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:bg-accent/10" aria-label={t('Clear filter')} onClick={onClear} data-query-filter-clear>
        <Icon name="x" size="xs" />
      </button>
    </span>
  )
}

/** The filter dialog, mounted only while open. */
export function QueryFilterHost({ open, filter, title, onClose }: { open: boolean; filter: QueryFilter; title: string; onClose: () => void }) {
  if (!open) return null
  return (
    <PanelBoundary>
      <Suspense fallback={null}>
        <QueryFilterDialog title={title} query={filter.query} ctx={filter.ctx} onApply={filter.setQuery} onClose={onClose} />
      </Suspense>
    </PanelBoundary>
  )
}
