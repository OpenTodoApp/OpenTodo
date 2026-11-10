// Activity in an answer (OpenSpec change assistant-project-blocks, spec "Project
// view blocks"): the latest 20 events of a project or a task from this device's
// activity record, newest first, worded as the activity list words them (who, what,
// on which task, when). Read-only: no filters and no older pages. A task's title
// opens it. Lazy chunk.
import { useCallback, useMemo } from 'react'
import type { AssistantBlock } from '../../../lib/assistantBlocks'
import { useBlockActivity, useBlockTasks } from '../../../lib/assistantBlockData'
import { describeEvent, guestActorLabel } from '../../../lib/activity'
import { t } from '../../../lib/i18n'
import { useAllProjects, useMembershipMap } from '../../../lib/localData'
import { memberName, useMe } from '../../../lib/sharing'
import { Icon } from '../../../ui'
import { useDateTimeFormat } from '../../DateTimePrefsProvider'
import { openTaskPanel } from '../../panel'
import { navigate } from '../../router'

/** The most events a block shows (design "Risks"). */
const MAX_EVENTS = 20

export default function ActivityBlock({ block }: { block: Extract<AssistantBlock, { kind: 'activity' }> }) {
  const dt = useDateTimeFormat()
  const me = useMe()
  const memberships = useMembershipMap()
  const projects = useAllProjects()
  const all = useBlockActivity(block)
  const events = useMemo(() => (all ?? []).slice(0, MAX_EVENTS), [all])
  // A project's events name their tasks; a task's own block does not repeat it.
  const taskIds = useMemo(() => (block.of === 'project' ? [...new Set(events.map((e) => e.taskId).filter((id): id is string => !!id))] : []), [block.of, events])
  const rows = useBlockTasks(taskIds)
  const titles = useMemo(() => new Map((rows ?? []).filter((r) => !!r).map((r) => [r!.id, r!.title])), [rows])
  const name = useCallback((id: string) => (id && id === me ? t('You') : memberName(id, memberships) ?? t('Someone')), [me, memberships])
  const projectName = useCallback((id: string | null) => (id ? projects.find((p) => p.id === id)?.name ?? t('another project') : t('Inbox')), [projects])
  if (!all) return null
  return (
    <div className="space-y-2 p-3" data-assistant-activity={block.of}>
      {events.length === 0 ? <p className="text-meta text-faint">{t('No activity on this device yet.')}</p> : (
        <ol className="space-y-1.5" aria-label={t('Activity')}>
          {events.map((e) => {
            const title = block.of === 'project' && e.taskId && e.entity !== 'project' ? titles.get(e.taskId) || e.taskTitle || t('a task') : null
            return (
              <li key={e.id} className="flex items-baseline gap-3 text-meta" data-event={e.kind}>
                <span className="min-w-0 flex-1 text-muted">
                  <strong className="font-medium text-default">{guestActorLabel(e) ?? name(e.actor)}</strong>{' '}
                  {describeEvent(e, name, projectName)}
                  {title && (
                    <> {e.entity === 'comment' ? t('on', { context: 'comment' }) : '·'}{' '}
                      <button type="button" className="text-default underline decoration-dotted underline-offset-2 user-text" onClick={() => openTaskPanel(e.taskId!)}>{title}</button>
                    </>
                  )}
                </span>
                <time className="shrink-0 tabular-nums text-faint" dateTime={new Date(e.ts).toISOString()}>{dt.formatInstant(e.ts, 'datetime')}</time>
              </li>
            )
          })}
        </ol>
      )}
      <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm -ml-2 gap-1"
        onClick={() => (block.of === 'project' ? navigate({ view: 'project', id: block.id }) : openTaskPanel(block.id))}>
        <Icon name="arrow-right" size="sm" />{block.of === 'project' ? t('Open project') : t('Open task')}
      </button>
    </div>
  )
}
