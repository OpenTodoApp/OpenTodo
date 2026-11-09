// A task list in an answer (OpenSpec change assistant-generative-ui, spec "Task list
// block"): the app's task rows in the order the model gave, read live from the
// device. Ticking a row is the app's own completion with its Undo; the block never
// scrolls on its own. Lazy chunk.
import { useMemo } from 'react'
import type { AssistantBlock } from '../../../lib/assistantBlocks'
import { useBlockTasks } from '../../../lib/assistantBlockData'
import { t } from '../../../lib/i18n'
import { resolveLabels } from '../../../lib/labels'
import { useAllLabels, useAllProjects, useMembershipMap } from '../../../lib/localData'
import { canEditTask } from '../../../lib/sharing'
import type { Task } from '../../../lib/types'
import { act } from '../../actionError'
import { openTaskPanel } from '../../panel'
import { TaskRow } from '../../TaskRow'
import { completeWithUndo } from '../../undoable'

export default function TasksBlock({ block }: { block: Extract<AssistantBlock, { kind: 'tasks' }> }) {
  const rows = useBlockTasks(block.ids)
  const projects = useAllProjects()
  const labels = useAllLabels()
  const memberships = useMembershipMap()
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])
  if (!rows) return null
  const live = rows.filter((r): r is Task => !!r)
  const gone = rows.length - live.length
  return (
    <div data-assistant-tasks>
      {block.title && <p className="border-b border-default px-3 py-2 text-body font-semibold user-text">{block.title}</p>}
      {live.length > 0 && (
        <ul aria-label={block.title || t('Tasks')}>
          {live.map((task) => (
            <TaskRow key={task.id} task={task} project={task.project_id ? projectMap.get(task.project_id) : undefined} labels={resolveLabels(task.labels, labelMap)}
              showProject selected={false} actions={false} readOnly={!canEditTask(task, memberships)}
              onToggle={() => act(completeWithUndo(task.id, !task.completed_at))} onOpen={() => openTaskPanel(task.id)} />
          ))}
        </ul>
      )}
      {gone > 0 && <p className="px-3 py-2 text-meta text-muted">{t('{n, plural, one {# task removed} other {# tasks removed}}', { n: gone })}</p>}
    </div>
  )
}
