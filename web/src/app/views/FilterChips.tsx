// The view toolbar's filter chips (OpenSpec change views-and-display, design D5): the
// query's top-level conditions in words, read from the same builder tree as the filter
// panel. A chip opens the panel; "Filter" opens it to add a condition. The chips only
// read the query: every edit goes through the panel, so the formula stays the stored form.
import { useMemo } from 'react'
import { Icon, type IconName } from '../../ui'
import { parse } from '../../lib/filter'
import { toBuilder, type BItem, type Leaf } from '../../lib/filter/builder'
import { t } from '../../lib/i18n'
import { conditionText } from '../filter/conditionText'

const LEAF_ICON: Record<Leaf['kind'], IconName> = {
  label: 'tag', project: 'folder', priority: 'flag', date: 'calendar-days', keyword: 'circle-check-big', search: 'search',
  origin: 'link', workspace: 'briefcase', tracked: 'timer', field: 'list', nofield: 'list',
}

export interface Chip { id: string; text: string; icon: IconName; not: boolean }

function itemChip(item: BItem): Chip {
  if (item.type === 'condition') return { id: item.id, text: conditionText(item.leaf), icon: LEAF_ICON[item.leaf.kind], not: item.not }
  const n = item.items.length
  return {
    id: item.id, icon: 'layers', not: item.not,
    text: item.op === 'or' ? t('{n, plural, one {Any of # condition} other {Any of # conditions}}', { n }) : t('{n, plural, one {All of # condition} other {All of # conditions}}', { n }),
  }
}

/** The chips of a query: one per top-level condition of an "All of these" query, else one for the whole query; none when it does not parse. */
export function queryChips(query: string): Chip[] {
  let root
  try {
    root = toBuilder(parse(query))
  } catch {
    return []
  }
  if (!root) return query.trim() ? [{ id: 'query', text: t('Custom query'), icon: 'filter', not: false }] : []
  if (root.op === 'and' && !root.not) return root.items.map(itemChip)
  return [itemChip(root)]
}

export function FilterChips({ query, onOpen }: { query: string; onOpen: (adding: boolean) => void }) {
  const chips = useMemo(() => queryChips(query), [query])
  return (
    <ul className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label={t('Conditions')} data-filter-chips>
      {chips.map((c) => (
        <li key={c.id} className="min-w-0">
          <button type="button" data-toolbar-chip onClick={() => onOpen(false)}
            className="touch-target flex min-w-0 max-w-72 items-center gap-1.5 rounded-control border border-soft px-2 py-1 text-meta text-default hover:bg-sunken">
            <Icon name={c.icon} className="shrink-0 text-faint" />
            {c.not && <span className="shrink-0 font-medium text-danger">{t('Not')}</span>}
            <span className="truncate">{c.text}</span>
          </button>
        </li>
      ))}
      <li>
        <button type="button" data-toolbar-add onClick={() => onOpen(true)}
          className="touch-target flex items-center gap-1 rounded-control px-2 py-1 text-meta text-muted hover:bg-sunken hover:text-default">
          <Icon name="plus" />{t('Filter')}
        </button>
      </li>
    </ul>
  )
}
