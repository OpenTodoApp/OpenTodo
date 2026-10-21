// Comments · Activity · History · Time area of the task panel (OpenSpec task-detail-redesign,
// D5; web-app "Comments, activity and history tabs"). The last tab is remembered on
// this device; Shift+C switches to Comments and focuses the composer. History is
// a separate chunk, loaded when its tab is first opened.
import { Skeleton } from '../../ui'
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLiveCommentCount } from '../../lib/localData'
import type { Task } from '../../lib/types'
import { Tabs } from '../../ui'
import { ActivityTab } from './ActivityTab'
import { CommentsTab } from './CommentsTab'
import { TimeTab, useTaskTotal } from './TimeTab'
import { formatMinutes } from '../../lib/duration'
import { useTaskEntries } from '../../lib/timeEntries'
import { useShortcutScope } from '../shortcuts'
import { t } from '../../lib/i18n'

const HistoryTab = lazy(() => import('./HistoryTab'))

export const TASK_TAB_KEY = 'ot.taskTab'
export type TaskTab = 'comments' | 'activity' | 'history' | 'time'
const TABS: readonly TaskTab[] = ['comments', 'activity', 'history', 'time']

export function readTaskTab(): TaskTab {
  try {
    const v = localStorage.getItem(TASK_TAB_KEY)
    return TABS.includes(v as TaskTab) ? (v as TaskTab) : 'comments'
  } catch {
    return 'comments'
  }
}

function writeTaskTab(tab: TaskTab) {
  try {
    localStorage.setItem(TASK_TAB_KEY, tab)
  } catch {
    // device-local convenience only
  }
}

export interface ConversationTabsProps {
  task: Task
  userId?: string
  /** Viewer of the task's shared project: no restore, composer still available. */
  readOnly: boolean
  /** Open another task id (a restore may move the task across scopes and return a new id). */
  onOpen?: (id: string) => void
  /** The panel's pinned bottom, where the comment composer renders while Comments is shown. */
  composerHost?: HTMLElement | null
  /** The task page variant: the page scrolls and the header is sticky inside it. */
  page?: boolean
}

/** The nearest ancestor that scrolls vertically (the panel's body), else the page. */
function scrollerOf(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY
    if ((y === 'auto' || y === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

export function ConversationTabs({ task, userId, readOnly, onOpen, composerHost, page = false }: ConversationTabsProps) {
  const [tab, setTabState] = useState<TaskTab>(readTaskTab)
  // The tab bar stays where it is on screen when the tab changes (task-panel-polish D5):
  // its position before the switch, and the height that keeps a shorter tab from pulling it down.
  const section = useRef<HTMLElement | null>(null)
  const bar = useRef<HTMLDivElement | null>(null)
  const keep = useRef<{ stuck: boolean; top: number; scroller: HTMLElement } | null>(null)
  const [minHeight, setMinHeight] = useState<number | undefined>(undefined)
  const [focusComment, setFocusComment] = useState<string | null>(null)
  const [focusComposer, setFocusComposer] = useState(0)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const count = useLiveCommentCount(task.id)
  // Time (time-tracking D5): "Time · 35m" once something was tracked.
  const tracked = useTaskTotal(task.id)
  const hasEntries = useTaskEntries(task.id).length > 0

  const setTab = (item: TaskTab) => {
    if (bar.current && item !== tab) {
      const scroller = scrollerOf(bar.current)
      const top = bar.current.getBoundingClientRect().top - (scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top)
      const natural = section.current ? section.current.getBoundingClientRect().top - (scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top) : top
      // Pinned: the section starts above the top of the scroller while the bar sits at it.
      keep.current = { stuck: natural < top - 1, top, scroller }
    }
    setTabState(item)
    writeTaskTab(item)
  }

  useLayoutEffect(() => {
    const k = keep.current
    keep.current = null
    if (!k || !bar.current || !section.current) return
    // The scroller found before the switch: with a shorter tab it may no longer overflow.
    const scroller = k.scroller
    const origin = scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top
    if (k.stuck) {
      // Keep the bar pinned and start the new tab under it: enough height below the bar, then
      // the scroll position that puts the section's start just above the visible area.
      const min = Math.max(0, scroller.clientHeight - bar.current.offsetHeight - Math.max(0, k.top))
      // On the element first, so the scroll position below is not clamped by the shorter tab.
      const tabPanel = bar.current.nextElementSibling as HTMLElement | null
      if (tabPanel) tabPanel.style.minHeight = `${min}px`
      setMinHeight(min)
      const sectionTop = section.current.getBoundingClientRect().top - origin + scroller.scrollTop
      const style = getComputedStyle(section.current)
      const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.borderTopWidth) || 0)
      scroller.scrollTop = Math.max(0, sectionTop + padding - k.top)
    } else {
      const now = bar.current.getBoundingClientRect().top - origin
      if (Math.abs(now - k.top) > 1) scroller.scrollTop += now - k.top
    }
  }, [tab])

  useEffect(() => { setFocusComment(null); setMinHeight(undefined) }, [task.id])

  // Shift+C (outside text fields) shows Comments and focuses the composer (`panel.comment`); `c` completes the selected task.
  useShortcutScope('panel', { 'panel.comment': () => { setTab('comments'); setFocusComposer((n) => n + 1) } })

  // After the Comments tab rendered: focus the composer and bring it into view.
  useEffect(() => {
    if (!focusComposer) return
    const el = composerRef.current
    el?.focus()
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [focusComposer, tab])

  return (
    <section ref={section} className="border-t border-default px-4 pb-4 pt-1" aria-label={t('Comments, activity, history and time')} data-conversation>
      {/* The tab bar pins under the panel header while the thread scrolls (web-app "Conversation tabs stay reachable"). */}
      <Tabs label={t('Task conversation')} value={tab} onChange={(id) => setTab(id as TaskTab)}
        rowRef={(el) => { bar.current = el }} panelStyle={minHeight ? { minHeight, overflowAnchor: 'none' } : { overflowAnchor: 'none' }}
        rowClassName={`sticky z-[5] -mx-4 px-4 ${page ? 'top-[var(--panel-header-h,0px)] bg-canvas' : 'top-0 bg-surface'}`}
        tabs={[{ id: 'comments', label: t('Comments'), count }, { id: 'activity', label: t('Activity') }, { id: 'history', label: t('History') },
          { id: 'time', label: hasEntries ? t('Time · {duration}', { duration: formatMinutes(tracked) }) : t('Time', { context: 'tracking' }) }]}>
        {tab === 'comments' && <CommentsTab ref={composerRef} task={task} userId={userId} focusComment={focusComment} composerHost={composerHost} expand={focusComposer} />}
        {tab === 'activity' && (
          <ActivityTab task={task} userId={userId} onOpenComment={(id) => { setFocusComment(id); setTab('comments') }} />
        )}
        {tab === 'history' && (
          <Suspense fallback={<Skeleton shape="line" count={4} label={t('Loading history')} />}>
            <HistoryTab taskId={task.id} readOnly={readOnly} onRestored={(id) => id !== task.id && onOpen?.(id)} />
          </Suspense>
        )}
        {tab === 'time' && <TimeTab task={task} readOnly={readOnly} />}
      </Tabs>
    </section>
  )
}
