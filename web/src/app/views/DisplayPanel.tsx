// The display panel of a view (OpenSpec change views-and-display, design D2): how the
// results are shown, never which tasks match. Layout, grouping, order, completed tasks
// and the properties a row shows; the sort direction is folded under "More options".
// Opened from the toolbar's display button; every change applies at once.
import { useRef, useState, type ReactNode } from 'react'
import { Icon, IconButton, Popover, type IconName } from '../../ui'
import {
  GROUP_BY_OPTIONS, ROW_PROPERTIES, SORT_BY_OPTIONS, VIEW_LAYOUTS,
  type GroupBy, type RowProperty, type SortBy, type SortDir, type ViewLayout,
} from '../../lib/types'
import { msg, t, translatedMap } from '../../lib/i18n'

export interface ViewDisplay {
  layout: ViewLayout
  groupBy: GroupBy
  sortBy: SortBy
  sortDir: SortDir
  showCompleted: boolean
  hidden: readonly RowProperty[]
}

export const GROUP_LABEL = translatedMap<GroupBy>({ project: msg('Project'), due: msg('Due date'), priority: msg('Priority'), label: msg('Label'), none: msg('None') })
export const SORT_LABEL = translatedMap<SortBy>({ due: msg('Due date'), priority: msg('Priority'), position: msg('Manual order'), created: msg('Created'), title: msg('Title') })
const LAYOUT_LABEL = translatedMap<ViewLayout>({ list: msg('List'), board: msg('Board') })
const LAYOUT_ICON: Record<ViewLayout, IconName> = { list: 'list', board: 'kanban' }
export const PROPERTY_LABEL = translatedMap<RowProperty>({
  date: msg('Date'), project: msg('Project'), labels: msg('Labels'), estimate: msg('Estimate'), assignee: msg('Assignee'),
  deadline: msg('Deadline'), start: msg('Start'), origin: msg('Origin'),
})

export interface DisplayPanelProps {
  value: ViewDisplay
  onChange: (patch: Partial<ViewDisplay>) => void
}

/** The toolbar's display button and its panel. */
export function DisplayPanel({ value, onChange }: DisplayPanelProps) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  return (
    <>
      <IconButton ref={anchor} icon="sliders-horizontal" size="sm" label={t('Display options')} aria-haspopup="dialog" aria-expanded={open}
        data-display-trigger className={open ? 'bg-selected text-default' : ''} onClick={() => setOpen(!open)} />
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} label={t('Display options')} width="sm:w-[22rem]" className="p-0">
        <DisplayOptionsBody value={value} onChange={onChange} />
      </Popover>
    </>
  )
}

/** The panel's content; also rendered on its own in stories and tests. */
export function DisplayOptionsBody({ value, onChange }: DisplayPanelProps) {
  const [more, setMore] = useState(false)
  const toggle = (p: RowProperty) => {
    const hidden = value.hidden.includes(p) ? value.hidden.filter((x) => x !== p) : [...value.hidden, p]
    onChange({ hidden: ROW_PROPERTIES.filter((x) => hidden.includes(x)) })
  }
  return (
    <div data-display-panel className="text-meta">
      <div className="space-y-2 p-3">
        <div role="radiogroup" aria-label={t('Layout')} className="grid grid-cols-2 gap-0.5 rounded-control bg-sunken p-0.5" data-display-layout>
          {VIEW_LAYOUTS.map((l) => (
            <button key={l} type="button" role="radio" aria-checked={value.layout === l}
              className={`touch-target flex items-center justify-center gap-1.5 rounded-control px-3 py-1.5 ${value.layout === l ? 'bg-raised text-strong shadow-1' : 'text-muted hover:text-default'}`}
              onClick={() => onChange({ layout: l })}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
                e.preventDefault()
                const next = VIEW_LAYOUTS[(VIEW_LAYOUTS.indexOf(value.layout) + 1) % VIEW_LAYOUTS.length]
                onChange({ layout: next })
                ;(e.currentTarget.parentElement?.querySelector(`[data-layout="${next}"]`) as HTMLElement | null)?.focus()
              }}
              data-layout={l} tabIndex={value.layout === l ? 0 : -1}>
              <Icon name={LAYOUT_ICON[l]} />{LAYOUT_LABEL[l]}
            </button>
          ))}
        </div>
        <OptionRow label={t('Group by')}>
          <select className="ui-input w-full py-1 text-meta" aria-label={t('Group by')} value={value.groupBy}
            onChange={(e) => onChange({ groupBy: e.target.value as GroupBy })}>
            {GROUP_BY_OPTIONS.map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
          </select>
        </OptionRow>
        <OptionRow label={t('Order by')}>
          <select className="ui-input w-full py-1 text-meta" aria-label={t('Order by')} value={value.sortBy}
            onChange={(e) => onChange({ sortBy: e.target.value as SortBy })}>
            {SORT_BY_OPTIONS.map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
          </select>
        </OptionRow>
        <OptionRow label={t('Completed tasks')}>
          <select className="ui-input w-full py-1 text-meta" aria-label={t('Completed tasks')} value={value.showCompleted ? 'show' : 'hide'}
            onChange={(e) => onChange({ showCompleted: e.target.value === 'show' })}>
            <option value="hide">{t('Hide')}</option>
            <option value="show">{t('Show')}</option>
          </select>
        </OptionRow>
      </div>
      <div className="border-t border-soft p-3">
        <p id="display-props-label" className="mb-2 text-muted">{t('Show on rows')}</p>
        <div role="group" aria-labelledby="display-props-label" className="flex flex-wrap gap-1.5" data-display-props>
          {ROW_PROPERTIES.map((p) => {
            const shown = !value.hidden.includes(p)
            return (
              <button key={p} type="button" aria-pressed={shown} data-prop={p} onClick={() => toggle(p)}
                className={`touch-target rounded-chip border px-2.5 py-1 ${shown ? 'border-strong bg-raised text-strong' : 'border-soft text-faint hover:text-muted'}`}>
                {PROPERTY_LABEL[p]}
              </button>
            )
          })}
        </div>
      </div>
      <div className="border-t border-soft">
        <button type="button" aria-expanded={more} onClick={() => setMore(!more)} data-display-more
          className="flex w-full items-center gap-1.5 px-3 py-2.5 text-left text-default hover:bg-sunken">
          <Icon name="chevron-right" size="xs" className={`text-faint transition-transform duration-(--duration-ui) ${more ? 'rotate-90' : ''}`} />
          {t('More options')}
          <span className="ml-auto truncate text-faint">{t('Sort direction')}</span>
        </button>
        {more && (
          <div className="px-3 pb-3">
            <OptionRow label={t('Direction')}>
              <select className="ui-input w-full py-1 text-meta" aria-label={t('Sort direction')} value={value.sortDir}
                onChange={(e) => onChange({ sortDir: e.target.value as SortDir })}>
                <option value="asc">{value.sortBy === 'priority' ? t('Ascending (p4 first)') : t('Ascending')}</option>
                <option value="desc">{value.sortBy === 'priority' ? t('Descending (p1 first)') : t('Descending')}</option>
              </select>
            </OptionRow>
          </div>
        )}
      </div>
    </div>
  )
}

function OptionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_10rem] items-center gap-3">
      <span className="text-muted" aria-hidden>{label}</span>
      {children}
    </div>
  )
}
