import { Button, Icon, PageBody, PageHeader } from '../ui'
import { useEffect, useMemo, useState } from 'react'
import { useAllProjects, useDeletedTasks, useMembershipMap, useMeta } from '../lib/localData'
import { restoreProject, restoreTask } from '../lib/ops'
import { canDeleteProject, canEditTasks, roleOf } from '../lib/sharing'
import { emptyTrash, PENDING_PURGES_KEY, purgeItems, remainingDays, RETENTION_KEY, trashItems, type PurgeRequest, type TrashItem } from '../lib/trash'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { useShortcutScope } from './shortcuts'
import { t } from '../lib/i18n'

const NO_PURGES: PurgeRequest[] = []

/**
 * The Trash (OpenSpec `trash-and-history`): deleted tasks and projects from local
 * data, newest first. Restore works offline; permanent deletion asks the server
 * and shows as pending while offline. Keys: j/k select, r restore, Delete purge.
 */
export function TrashView() {
  const dt = useDateTimeFormat()
  const tasks = useDeletedTasks()
  const projects = useAllProjects()
  const retention = useMeta<number>(RETENTION_KEY, 30)
  const pending = useMeta<PurgeRequest[]>(PENDING_PURGES_KEY, NO_PURGES)
  const items = useMemo(() => trashItems(tasks, projects), [tasks, projects])
  const memberMap = useMembershipMap()
  const pendingKeys = useMemo(() => new Set(pending.map((p) => `${p.entity}:${p.id}`)), [pending])
  const taskById = useMemo(() => new Map(tasks.map((tk) => [tk.id, tk])), [tasks])
  const [selected, setSelected] = useState(0)
  const [confirm, setConfirm] = useState<TrashItem | 'all' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const now = Date.now()

  const allowed = (it: TrashItem): boolean => {
    if (it.entity === 'project') return canDeleteProject(roleOf(it.id, memberMap))
    return canEditTasks(roleOf(taskById.get(it.id)?.project_id, memberMap))
  }

  async function restore(it: TrashItem) {
    setError(null)
    try {
      if (it.entity === 'task') await restoreTask(it.id)
      else await restoreProject(it.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function purge(target: TrashItem | 'all') {
    setConfirm(null)
    setError(null)
    try {
      if (target === 'all') await emptyTrash()
      else await purgeItems([{ entity: target.entity, id: target.id }])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    if (selected >= items.length && items.length > 0) setSelected(items.length - 1)
  }, [items.length, selected])

  // The Trash's `view` scope: j / k select, r restores, Delete asks, Enter confirms, Esc cancels.
  const it = items[selected]
  useShortcutScope('view', {
    'trash.down': () => { if (confirm) return false; setSelected((i) => Math.min(i + 1, items.length - 1)) },
    'trash.up': () => { if (confirm) return false; setSelected((i) => Math.max(i - 1, 0)) },
    'trash.restore': () => { if (confirm || !it || !allowed(it)) return false; void restore(it) },
    'trash.purge': () => { if (confirm || !it || !allowed(it)) return false; setConfirm(it) },
    'trash.confirm': () => { if (!confirm) return false; void purge(confirm) },
    'trash.escape': () => { if (!confirm) return false; setConfirm(null) },
  }, { view: 'trash' })

  return (
    <PageBody width="list">
      <PageHeader title={t('Trash')} help="trash"
        meta={retention > 0 ? t('Deleted permanently after {retention} days', { retention }) : t('Kept until you delete them permanently')}
        actions={items.length > 0 ? <Button variant="ghost" size="sm" className="text-danger" onClick={() => setConfirm('all')}>{t('Empty Trash')}</Button> : undefined} />
      {error && <p role="alert" className="mb-3 text-body text-danger">{error}</p>}
      {confirm && (
        <div role="alertdialog" aria-label={t('Confirm permanent deletion')} className="mb-3 flex flex-wrap items-center gap-2 rounded-control border border-danger bg-danger-soft px-3 py-2 text-body text-on-danger-soft">
          <span className="flex-1">
            {confirm === 'all' ? t('{n, plural, one {Permanently delete # item? This cannot be undone.} other {Permanently delete all # items? This cannot be undone.}}', { n: items.length }) : confirm.entity === 'project' ? t('Permanently delete “{title}” and its tasks? This cannot be undone.', { title: confirm.title }) : t('Permanently delete “{title}”? This cannot be undone.', { title: confirm.title })}
          </span>
          <button className="ui-btn ui-btn--primary ui-btn--sm bg-danger text-meta hover:bg-danger/90" autoFocus onClick={() => void purge(confirm)}>{t('Delete permanently')}</button>
          <button className="ui-btn ui-btn--ghost ui-btn--sm text-meta" onClick={() => setConfirm(null)}>{t('Cancel')}</button>
        </div>
      )}
      {items.length === 0 ? (
        <p className="py-12 text-center text-body text-faint">{t('The Trash is empty.')}</p>
      ) : (
        <ul className="divide-y divide-(--ot-border)" aria-label={t('Deleted items')}>
          {items.map((it, i) => {
            const days = remainingDays(it.deletedAt, retention, now)
            const isPending = pendingKeys.has(`${it.entity}:${it.id}`)
            const ok = allowed(it)
            return (
              <li key={`${it.entity}:${it.id}`} data-trash-id={it.id} onClick={() => setSelected(i)}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-2 text-body ${i === selected ? 'bg-accent-soft' : ''}`}>
                <span className="w-5 text-center" aria-hidden>{it.entity === 'project' ? <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: it.color }} /> : <Icon name="circle" size="xs" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{it.title}</span>
                  <span className="block text-meta text-faint">
                    {[
                      it.entity === 'project' ? t('Project') : it.projectName,
                      t('deleted {instant}', { instant: dt.formatInstant(it.deletedAt, 'datetime') }),
                      isPending ? t('pending permanent deletion') : days !== null ? t('{n, plural, one {# day left} other {# days left}}', { n: days }) : '',
                    ].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {ok && (
                  <span className="flex gap-1">
                    <button className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-0.5 text-meta" onClick={() => void restore(it)}>{t('Restore')}</button>
                    <button className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-0.5 text-meta text-danger" disabled={isPending} onClick={() => setConfirm(it)}>{t('Delete permanently')}</button>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </PageBody>
  )
}
