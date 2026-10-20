// Comments · Activity · History · Time area of the task panel (OpenSpec task-detail-redesign,
// D5; web-app "Comments, activity and history tabs"). The last tab is remembered on
// this device; Shift+C switches to Comments and focuses the composer. History is
// a separate chunk, loaded when its tab is first opened.
import { Skeleton } from '../../ui'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
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
}

export function ConversationTabs({ task, userId, readOnly, onOpen, composerHost }: ConversationTabsProps) {
  const [tab, setTabState] = useState<TaskTab>(readTaskTab)
  const [focusComment, setFocusComment] = useState<string | null>(null)
  const [focusComposer, setFocusComposer] = useState(0)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const count = useLiveCommentCount(task.id)
  // Time (time-tracking D5): "Time · 35m" once something was tracked.
  const tracked = useTaskTotal(task.id)
  const hasEntries = useTaskEntries(task.id).length > 0

  const setTab = (item: TaskTab) => {
    setTabState(item)
    writeTaskTab(item)
  }

  useEffect(() => setFocusComment(null), [task.id])

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
    <section className="border-t border-default px-4 pb-4 pt-1" aria-label={t('Comments, activity, history and time')}>
      <Tabs label={t('Task conversation')} value={tab} onChange={(id) => setTab(id as TaskTab)}
        tabs={[{ id: 'comments', label: t('Comments'), count }, { id: 'activity', label: t('Activity') }, { id: 'history', label: t('History') },
          { id: 'time', label: hasEntries ? t('Time · {duration}', { duration: formatMinutes(tracked) }) : t('Time', { context: 'tracking' }) }]}>
        {tab === 'comments' && <CommentsTab ref={composerRef} task={task} userId={userId} focusComment={focusComment} composerHost={composerHost} />}
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
