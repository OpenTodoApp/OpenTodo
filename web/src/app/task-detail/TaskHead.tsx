// The parts of the task's head shared by the docked panel and the task page
// (task-full-page D5): the complete control and the editable title, the "Link copied"
// and "Published" marks, the links to the parent and the recurring task, and the
// viewer's note.
import type { Project } from '../../lib/types'
import { t } from '../../lib/i18n'
import { Icon, Tooltip } from '../../ui'
import { TitleField } from '../TitleField'
import type { TaskDetailModel } from './useTaskDetail'

const RING: Record<number, string> = { 1: 'border-p1 bg-p1-soft', 2: 'border-p2 bg-p2-soft', 3: 'border-p3 bg-p3-soft', 4: 'border-p4 bg-p4-soft' }

/** The checkbox and the title; `page` sets the title at the page's size and wraps it freely. */
export function TaskHead({ m, readOnly, projects, size }: { m: TaskDetailModel; readOnly: boolean; projects: Project[]; size: 'panel' | 'page' }) {
  const { task } = m
  if (!task) return null
  const done = !!task.completed_at
  const page = size === 'page'
  return (
    <>
      <button type="button" aria-label={done ? t('Reopen task') : t('Complete task')} aria-pressed={done} disabled={readOnly} onClick={() => m.toggle(task)} data-panel-complete
        className={`touch-target inline-flex shrink-0 items-center justify-center rounded-full pointer-fine:-m-0.5 pointer-fine:size-6 ${page ? 'mt-1 self-start' : ''}`}>
        <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition ${done ? 'border-accent bg-accent text-on-accent' : `${RING[task.priority] ?? 'border-p4'} hover:bg-success-soft`}`}>
          {done && <Icon name="check" size="xs" />}
        </span>
      </button>
      {/* The title wraps (to two lines in the panel, task-panel-facets D4); Enter commits. */}
      <TitleField multiline title={task.title} value={m.title} onChange={m.setTitle} onCommit={m.commitTitle}
        projects={projects} labels={m.labelList} readOnly={readOnly} fieldRef={m.titleField}
        className={`block w-full resize-none overflow-hidden rounded-control bg-transparent font-semibold leading-snug text-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/30 ${page ? 'text-h1' : 'text-h3'} ${done ? 'text-faint line-through' : ''}`}
        ariaLabel={t('Title')} placeholder={t('Untitled')} dataAttrs={{ 'data-task-title': true }} />
      {m.copied && <span role="status" className="text-meta text-muted">{t('Link copied')}</span>}
      {m.pageStatus && (
        <Tooltip label={t('This task has a page anyone with its link can open')}>
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm shrink-0 gap-1 text-meta" onClick={() => m.setPageDialog(true)} data-page-marker>
            <Icon name="globe" size="xs" />{t('Published')}
          </button>
        </Tooltip>
      )}
    </>
  )
}

/** The links to the parent task and to the recurring task of an occurrence. */
export function TaskRelations({ m, onOpen }: { m: TaskDetailModel; onOpen?: (id: string) => void }) {
  const { task, parent, series } = m
  if (!task || (!parent && !series)) return null
  return (
    <>
      {parent && (
        <Tooltip label={t('Open parent task')}>
          <button type="button" className="flex items-center gap-1 text-meta text-faint hover:text-default" onClick={() => onOpen?.(parent.id)}>
            <Icon name="corner-down-right" />{parent.title || t('Untitled')}
            {parent.deleted_at ? ` ${t('(deleted)')}` : parent.completed_at && !task.completed_at ? ` ${t('(completed)')}` : ''}
          </button>
        </Tooltip>
      )}
      {series && (
        <Tooltip label={t('Open the recurring task')}>
          <button type="button" className="flex items-center gap-1 text-meta text-faint hover:text-default" onClick={() => onOpen?.(series.id)}>
            <Icon name="repeat" />{task.completed_at ? t('Completed occurrence of {title}', { title: series.title || t('Untitled') }) : t('Single occurrence of {title}', { title: series.title || t('Untitled') })}{series.deleted_at ? ` ${t('(deleted)')}` : ''}
          </button>
        </Tooltip>
      )}
    </>
  )
}

/** The viewer's note under the header (web-app "Task panel in viewer mode"). */
export function ReadOnlyNote() {
  return (
    <p role="note" className="border-b border-default bg-sunken px-4 py-2 text-meta text-muted">
      {t('Read-only: you are a viewer of this shared project. You can still comment.')}
    </p>
  )
}
