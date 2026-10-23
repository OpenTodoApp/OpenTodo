// The task's header menu, shared by the docked panel and the task page (OpenSpec
// change task-full-page): Copy link, Help, the parent and recurring task, time
// tracking, Focus, the task page, Duplicate, Attach, Remove origin, Break this
// down and Delete. The page has no Expand: it already is the page.
import { keysOf } from '../../lib/shortcuts'
import { openHelp } from '../../lib/helpRequest'
import { duplicateTask } from '../../lib/templates'
import { updateTask } from '../../lib/ops'
import { t } from '../../lib/i18n'
import { Icon, Menu, MenuItem, MenuSeparator } from '../../ui'
import { act } from '../actionError'
import { navigate } from '../router'
import { requestAttach } from './attachRequest'
import { TrackMenuItem } from './TimeTab'
import type { TaskDetailModel } from './useTaskDetail'

export function TaskActionsMenu({ m, page, readOnly, onOpen }: { m: TaskDetailModel; page: boolean; readOnly: boolean; onOpen?: (id: string) => void }) {
  const { task, parent, series } = m
  if (!task) return null
  const done = !!task.completed_at
  return (
    <Menu kind="menu" label={t('Task actions')} trigger={<Icon name="ellipsis" size="md" />} triggerClassName="ui-btn ui-btn--ghost ui-btn--sm touch-target px-2 py-1.5" width="sm:w-60">
      <MenuItem label={t('Copy link')} icon="link" onSelect={m.copyLink} />
      <MenuItem label={t('Help')} icon="circle-help" description={t('The guide to the task page')} onSelect={() => openHelp('task-panel')} />
      {!page && <MenuItem label={t('Expand')} icon="external-link" description={t('Open the task as a page')} onSelect={() => navigate({ view: 'task', id: task.id })} />}
      {parent && <MenuItem label={t('Open parent task')} icon="corner-down-right" onSelect={() => onOpen?.(parent.id)} />}
      {series && <MenuItem label={t('Open recurring task')} icon="repeat" onSelect={() => onOpen?.(series.id)} />}
      {!readOnly && <TrackMenuItem task={task} />}
      {!readOnly && !done && <MenuItem label={t('Focus on this task')} icon="clock" description={t('One task, a timer, a break when you need one')} onSelect={() => navigate({ view: 'focus', id: task.id })} />}
      {m.canPublish && <MenuItem label={m.pageStatus ? t('Task page…') : t('Publish task page…')} icon="globe"
        description={m.online ? t('A page anyone with the link can open, reply to and tick') : t('Task pages need a connection')}
        disabled={!m.online} onSelect={() => m.setPageDialog(true)} data-publish-page />}
      {!readOnly && <MenuItem label={t('Duplicate')} icon="copy" shortcut={keysOf('list.duplicate')} onSelect={() => void duplicateTask(task.id).then((id) => onOpen?.(id))} />}
      {!readOnly && <MenuItem label={t('Attach')} icon="paperclip" description={t('Or paste or drop files on the task')} onSelect={() => requestAttach(task.id)} />}
      {/* The origin's Remove lives here; its row opens the source (task-panel-facets). */}
      {!readOnly && task.origin && <MenuItem label={t('Remove origin')} icon="x" onSelect={() => act(updateTask(task.id, { origin: null }))} />}
      {!readOnly && m.assistantAvailable && <MenuItem label={t('Break this down')} icon="list" onSelect={m.breakDown} />}
      {!readOnly && <MenuSeparator />}
      {!readOnly && <MenuItem label={t('Delete')} icon="trash-2" danger onSelect={m.remove} />}
    </Menu>
  )
}
