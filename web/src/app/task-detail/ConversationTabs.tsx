// Comments · Activity · History area of the task panel (OpenSpec task-detail-redesign, D5).
// Placeholder during the split: it renders the existing conversation and history
// until the tabbed version replaces it.
import type { Task } from '../../lib/types'
import { HistoryPanel } from '../HistoryPanel'
import { TaskConversation } from '../TaskConversation'

export interface ConversationTabsProps {
  task: Task
  userId?: string
  /** Viewer of the task's shared project: no restore, composer still available. */
  readOnly: boolean
  /** Open another task id (a restore may move the task across scopes and return a new id). */
  onOpen?: (id: string) => void
}

export function ConversationTabs({ task, userId, readOnly, onOpen }: ConversationTabsProps) {
  return (
    <>
      <div className="border-t border-slate-200 px-4 pb-4 dark:border-slate-800">
        <TaskConversation task={task} userId={userId} />
      </div>
      <div className="border-t border-slate-200 px-4 pb-4 dark:border-slate-800">
        <HistoryPanel entity="task" id={task.id} readOnly={readOnly} onRestored={(id) => id !== task.id && onOpen?.(id)} />
      </div>
    </>
  )
}
