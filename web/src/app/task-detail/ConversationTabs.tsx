// Comments · Activity · History area of the task panel (OpenSpec task-detail-redesign,
// D5; web-app "Comments, activity and history tabs"). The last tab is remembered on
// this device; Shift+C switches to Comments and focuses the composer. History is
// a separate chunk, loaded when its tab is first opened.
import { useLiveQuery } from 'dexie-react-hooks'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { db } from '../../lib/db'
import type { Task } from '../../lib/types'
import { Tabs } from '../../ui'
import { ActivityTab } from './ActivityTab'
import { CommentsTab } from './CommentsTab'

const HistoryTab = lazy(() => import('./HistoryTab'))

export const TASK_TAB_KEY = 'ot.taskTab'
export type TaskTab = 'comments' | 'activity' | 'history'
const TABS: readonly TaskTab[] = ['comments', 'activity', 'history']

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
}

export function ConversationTabs({ task, userId, readOnly, onOpen }: ConversationTabsProps) {
  const [tab, setTabState] = useState<TaskTab>(readTaskTab)
  const [focusComment, setFocusComment] = useState<string | null>(null)
  const [focusComposer, setFocusComposer] = useState(0)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const count = useLiveQuery(() => db.comments.where('task_id').equals(task.id).filter((c) => !c.deleted_at).count(), [task.id], 0)

  const setTab = (t: TaskTab) => {
    setTabState(t)
    writeTaskTab(t)
  }

  useEffect(() => setFocusComment(null), [task.id])

  // Shift+C (outside text fields) shows Comments and focuses the composer; `c` completes the selected task.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'C' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      e.preventDefault()
      setTab('comments')
      setFocusComposer((n) => n + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // After the Comments tab rendered: focus the composer and bring it into view.
  useEffect(() => {
    if (!focusComposer) return
    const el = composerRef.current
    el?.focus()
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [focusComposer, tab])

  return (
    <section className="border-t border-default px-4 pb-4 pt-1" aria-label="Comments, activity and history">
      <Tabs label="Task conversation" value={tab} onChange={(id) => setTab(id as TaskTab)}
        tabs={[{ id: 'comments', label: 'Comments', count }, { id: 'activity', label: 'Activity' }, { id: 'history', label: 'History' }]}>
        {tab === 'comments' && <CommentsTab ref={composerRef} task={task} userId={userId} focusComment={focusComment} />}
        {tab === 'activity' && (
          <ActivityTab task={task} userId={userId} onOpenComment={(id) => { setFocusComment(id); setTab('comments') }} />
        )}
        {tab === 'history' && (
          <Suspense fallback={<p className="text-meta text-faint">Loading…</p>}>
            <HistoryTab taskId={task.id} readOnly={readOnly} onRestored={(id) => id !== task.id && onOpen?.(id)} />
          </Suspense>
        )}
      </Tabs>
    </section>
  )
}
