import { Button, Icon, PageBody, PageHeader } from '../ui'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/db'
import { restoreProject, restoreTask } from '../lib/ops'
import { canDeleteProject, canEditTasks, roleOf } from '../lib/sharing'
import { emptyTrash, PENDING_PURGES_KEY, purgeItems, remainingDays, RETENTION_KEY, trashItems, type PurgeRequest, type TrashItem } from '../lib/trash'
import type { Membership } from '../lib/types'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { useShortcutScope } from './shortcuts'

/**
 * The Trash (OpenSpec `trash-and-history`): deleted tasks and projects from local
 * data, newest first. Restore works offline; permanent deletion asks the server
 * and shows as pending while offline. Keys: j/k select, r restore, Delete purge.
 */
export function TrashView() {
  const dt = useDateTimeFormat()
  const tasks = useLiveQuery(() => db.tasks.filter((t) => !!t.deleted_at).toArray(), [], [])
  const projects = useLiveQuery(() => db.projects.toArray(), [], [])
  const memberships = useLiveQuery(() => db.memberships.toArray(), [], [] as Membership[])
  const retention = useLiveQuery(async () => ((await db.meta.get(RETENTION_KEY))?.value as number | undefined) ?? 30, [], 30)
  const pending = useLiveQuery(async () => ((await db.meta.get(PENDING_PURGES_KEY))?.value as PurgeRequest[] | undefined) ?? [], [], [] as PurgeRequest[])
  const items = useMemo(() => trashItems(tasks, projects), [tasks, projects])
  const memberMap = useMemo(() => new Map(memberships.map((m) => [m.projectId, m])), [memberships])
  const pendingKeys = useMemo(() => new Set(pending.map((p) => `${p.entity}:${p.id}`)), [pending])
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
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
      <PageHeader title="Trash" help="trash"
        meta={retention > 0 ? `Deleted permanently after ${retention} days` : 'Kept until you delete them permanently'}
        actions={items.length > 0 ? <Button variant="ghost" size="sm" className="text-danger" onClick={() => setConfirm('all')}>Empty Trash</Button> : undefined} />
      {error && <p role="alert" className="mb-3 text-body text-danger">{error}</p>}
      {confirm && (
        <div role="alertdialog" aria-label="Confirm permanent deletion" className="mb-3 flex flex-wrap items-center gap-2 rounded-control border border-danger bg-danger-soft px-3 py-2 text-body text-on-danger-soft">
          <span className="flex-1">
            {confirm === 'all' ? `Permanently delete all ${items.length} items? This cannot be undone.` : `Permanently delete “${confirm.title}”${confirm.entity === 'project' ? ' and its tasks' : ''}? This cannot be undone.`}
          </span>
          <button className="ui-btn ui-btn--primary ui-btn--sm bg-danger text-meta hover:bg-danger/90" autoFocus onClick={() => void purge(confirm)}>Delete permanently</button>
          <button className="ui-btn ui-btn--ghost ui-btn--sm text-meta" onClick={() => setConfirm(null)}>Cancel</button>
        </div>
      )}
      {items.length === 0 ? (
        <p className="py-12 text-center text-body text-faint">The Trash is empty.</p>
      ) : (
        <ul className="divide-y divide-(--ot-border)" aria-label="Deleted items">
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
                    {it.entity === 'project' ? 'Project' : it.projectName} · deleted {dt.formatInstant(it.deletedAt, 'datetime')}
                    {isPending ? ' · pending permanent deletion' : days !== null ? ` · ${days} day${days === 1 ? '' : 's'} left` : ''}
                  </span>
                </span>
                {ok && (
                  <span className="flex gap-1">
                    <button className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-0.5 text-meta" onClick={() => void restore(it)}>Restore</button>
                    <button className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-0.5 text-meta text-danger" disabled={isPending} onClick={() => setConfirm(it)}>Delete permanently</button>
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
