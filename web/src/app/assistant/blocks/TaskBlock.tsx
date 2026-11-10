// One task in full in an answer (OpenSpec change assistant-project-blocks, spec
// "Project view blocks"): the task panel's parts without their editors: the task's
// row (its dates, labels and project), the start of its notes, its subtasks as task rows and its
// latest comments, with Open task. Ticking the task or a subtask is the app's own
// completion with its Undo, as in task rows; nothing else changes. Lazy chunk.
import { useMemo } from 'react'
import type { AssistantBlock } from '../../../lib/assistantBlocks'
import { useBlockTask } from '../../../lib/assistantBlockData'
import { t } from '../../../lib/i18n'
import { resolveLabels } from '../../../lib/labels'
import { useAllLabels, useAllProjects, useMembershipMap } from '../../../lib/localData'
import { canEditTask, memberName, useMe } from '../../../lib/sharing'
import { Icon } from '../../../ui'
import { act } from '../../actionError'
import { useDateTimeFormat } from '../../DateTimePrefsProvider'
import { Markdown } from '../../Markdown'
import { openTaskPanel } from '../../panel'
import { TaskRow } from '../../TaskRow'
import { completeWithUndo } from '../../undoable'

/** The latest comments a block shows. */
const MAX_COMMENTS = 3

export default function TaskBlock({ block }: { block: Extract<AssistantBlock, { kind: 'task' }> }) {
  const data = useBlockTask(block.id)
  const projects = useAllProjects()
  const labels = useAllLabels()
  const memberships = useMembershipMap()
  const me = useMe()
  const dt = useDateTimeFormat()
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])
  if (!data) return null
  const task = data.task
  if (!task) return <p className="p-3 text-meta text-muted">{t('Removed')}</p>
  const readOnly = !canEditTask(task, memberships)
  const toggle = (tk: { id: string; completed_at: number | null }) => act(completeWithUndo(tk.id, !tk.completed_at))
  const done = data.subtasks.filter((s) => s.completed_at).length
  const comments = data.comments.slice(-MAX_COMMENTS)
  const author = (id: string, guest?: string | null) => guest || (id === me ? t('You') : memberName(id, memberships) ?? t('Someone'))
  return (
    <div data-assistant-task>
      <ul aria-label={t('Task')}>
        <TaskRow task={task} project={task.project_id ? projects.find((p) => p.id === task.project_id) : undefined} labels={resolveLabels(task.labels, labelMap)}
          showProject selected={false} actions={false} readOnly={readOnly} onToggle={() => toggle(task)} onOpen={() => openTaskPanel(task.id)} />
      </ul>
      <div className="space-y-3 border-t border-default p-3">
        {task.description.trim() && <div className="line-clamp-6 text-body" data-task-notes><Markdown source={task.description} /></div>}
        {data.subtasks.length > 0 && (
          // The subtasks as task rows (ticking is the rows' own completion), under the panel's heading and count.
          <section aria-label={t('Subtasks')} data-subtasks>
            <h3 className="mb-1 flex items-center gap-2 text-meta font-semibold text-muted">
              <Icon name="list" className="text-faint" />{t('Subtasks')}<span className="font-normal text-faint">{t('{done} of {total}', { done, total: data.subtasks.length })}</span>
            </h3>
            <ul className="-mx-3">
              {data.subtasks.map((s) => (
                <TaskRow key={s.id} task={s} showProject={false} selected={false} actions={false} readOnly={readOnly} onToggle={() => toggle(s)} onOpen={() => openTaskPanel(s.id)} />
              ))}
            </ul>
          </section>
        )}
        {comments.length > 0 && (
          <section aria-label={t('Comments')} data-task-comments>
            <h3 className="mb-1 flex items-center gap-2 text-meta font-semibold text-muted">
              <Icon name="message-circle" className="text-faint" />{t('Comments')}<span className="font-normal text-faint">{data.comments.length}</span>
            </h3>
            <ol className="space-y-2">
              {comments.map((c) => (
                <li key={c.id} className="text-body">
                  <p className="flex items-baseline gap-2 text-meta">
                    <strong className="font-medium text-default">{author(c.author_id, c.guest_name)}</strong>
                    <time className="tabular-nums text-faint" dateTime={new Date(c.created_at).toISOString()}>{dt.formatInstant(c.created_at, 'datetime')}</time>
                  </p>
                  <div className="line-clamp-3"><Markdown source={c.body} /></div>
                </li>
              ))}
            </ol>
          </section>
        )}
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm -ml-2 gap-1" onClick={() => openTaskPanel(task.id)}>
          <Icon name="arrow-right" size="sm" />{t('Open task')}
        </button>
      </div>
    </div>
  )
}
