import { useEffect, useMemo, useRef, useState } from 'react'
import { formatMinutes } from '../../lib/duration'
import { t } from '../../lib/i18n'
import { useLabels } from '../../lib/localData'
import { ComboboxPanel, EmptyState, hueFor, Icon, Popover, type IconName } from '../../ui'
import { PanelFrame } from '../PanelFrame'
import { useViewData } from '../useViews'
import { planSources, planSourceTasks, readTray, resolveSource, saveTray, type PlanSource, type PlanSourceKind } from './planSource'

const KIND_ICON: Record<PlanSourceKind, IconName> = { list: 'inbox', project: 'folder', label: 'tag', view: 'filter' }
const LIST_ICON: Record<string, IconName> = { inbox: 'inbox', nodate: 'calendar-days', overdue: 'hourglass' }
const iconOf = (s: PlanSource): IconName => (s.kind === 'list' ? LIST_ICON[s.key] ?? 'inbox' : KIND_ICON[s.kind])

export const PLAN_PANEL = 'calendar-plan'

export interface PlanActions {
  onPointerDown: (e: React.PointerEvent, id: string) => void
  onPlace: (id: string) => void
  onOpen: (id: string) => void
  /** Escape while a task from the list is being placed: cancel the placement, not the list (GitHub issue 352). */
  onEscape?: () => boolean
}

/**
 * The calendar view on screen registers its actions while mounted, so the open list
 * keeps working when the user switches Day, Week, Month or Plan (GitHub issue 350): the
 * panel outlives the view that opened it.
 */
let mounted: React.RefObject<PlanActions> | null = null
export function usePlanActions(actions: React.RefObject<PlanActions>): void {
  useEffect(() => {
    mounted = actions
    return () => { if (mounted === actions) mounted = null }
  }, [actions])
}
const current = (): PlanActions | null => mounted?.current ?? null

/**
 * The planning list in the shell's panel slot (time-blocking "Day and Week calendar
 * views"): the open tasks of one source (Inbox, no date, overdue, a project, a label or
 * a saved view; plan-list-sources), chosen with the Combobox, to drag onto a time or place with `s`.
 */
export function PlanPanel() {
  const { views, projects, tasks, ctx } = useViewData()
  const labels = useLabels()
  const [source, setSource] = useState<string>(readTray)
  const [picking, setPicking] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const sources = useMemo(() => planSources({ projects, labels, views }), [projects, labels, views])
  const chosen = resolveSource(source, sources)
  const list = useMemo(() => planSourceTasks(chosen, { projects, labels, views, tasks, today: ctx.today, ctx }), [chosen, projects, labels, views, tasks, ctx])
  const group: Record<PlanSourceKind, string> = { list: t('Lists'), project: t('Projects'), label: t('Labels'), view: t('Saved views') }
  return (
    <PanelFrame title={t('Plan')} testId="calendar-plan" onEscape={() => current()?.onEscape?.() ?? false}
      actions={(
        <>
          {/* The source picker is the Combobox (plan-list-sources D2): type to find a project, a label or a saved view. */}
          <button ref={anchor} type="button" aria-label={t('Plan from')} aria-haspopup="dialog" aria-expanded={picking} data-plan-source={chosen.key}
            onClick={() => setPicking(true)}
            className="inline-flex min-h-8 min-w-0 max-w-48 items-center gap-1 rounded-control border border-default px-2.5 py-1 text-meta text-muted hover:bg-sunken dark:hover:bg-raised">
            <Icon name={iconOf(chosen)} size="xs" /><span className="min-w-0 truncate">{chosen.label}</span><Icon name="chevron-down" size="xs" />
          </button>
          <Popover open={picking} onClose={() => setPicking(false)} anchor={anchor} label={t('Plan from')} align="end" width="sm:w-80" className="p-2">
            <ComboboxPanel<PlanSource>
              label={t('Plan from')}
              placeholder={t('Find a project, label or view…')}
              emptyText={t('Nothing matches.')}
              source={sources}
              getKey={(s) => s.key}
              getLabel={(s) => s.label}
              getGroup={(s) => group[s.kind]}
              selected={[chosen.key]}
              renderLeading={(s) => (
                <span aria-hidden className="flex h-6 w-6 items-center justify-center text-faint" data-hue={s.color ? hueFor(s.color) : undefined}>
                  <Icon name={iconOf(s)} className={s.color ? 'text-hue-solid' : undefined} />
                </span>
              )}
              onPick={(s) => { setSource(s.key); saveTray(s.key) }}
              onClose={() => setPicking(false)}
            />
          </Popover>
        </>
      )}>
      <p className="mb-2 text-meta text-faint">{t.rich('Drag a task onto a time, or focus one and press {key}.', { key: <span className="ui-kbd">s</span> })}</p>
      <ul className="space-y-0.5" aria-label={t('Tasks to plan')}>
        {/* The empty-state pattern with the sentence the panel needs (ux-audit-three-widths F2, F13). */}
        {list.length === 0 && <li><EmptyState compact title={t('Every task of these days is placed.')} /></li>}
        {list.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              data-tray-task={task.id}
              onPointerDown={(e) => current()?.onPointerDown(e, task.id)}
              onKeyDown={(e) => {
                if (e.key === 's' || e.key === 'Enter') {
                  e.preventDefault()
                  e.stopPropagation()
                  current()?.onPlace(task.id)
                }
              }}
              onDoubleClick={() => current()?.onOpen(task.id)}
              className="flex w-full cursor-grab touch-manipulation items-center gap-1 rounded-control px-2 py-1.5 text-left text-body hover:bg-sunken dark:hover:bg-raised"
            >
              <span className="truncate">{task.title || t('Untitled')}</span>
              {task.estimate_minutes ? <span className="ml-auto shrink-0 text-meta tabular-nums text-muted">{formatMinutes(task.estimate_minutes)}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </PanelFrame>
  )
}
