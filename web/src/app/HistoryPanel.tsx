import { Icon } from '../ui'
import { Tooltip } from '../ui'
import { Skeleton } from '../ui'
import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { isNetworkError } from '../lib/api'
import { canRestoreField, deviceLabel, fetchHistory, fieldLabel, formatValue, restoreValue } from '../lib/history'
import { getDeviceId } from '../lib/ops'
import { syncNow } from '../lib/sync'
import type { ChangeSet } from '../lib/types'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { useFieldDefs } from './useFields'

/**
 * Revision history of a project (OpenSpec `trash-and-history`; tasks use the task
 * panel's History tab, task-detail-redesign): a timeline
 * of change sets read live from the server's op log, newest first, with "restore
 * this value" on each field change. Offline it says so and shows nothing stale.
 */
export function HistoryPanel({ entity, id, readOnly = false, onRestored, embedded = false }: {
  entity: 'task' | 'project'
  id: string
  readOnly?: boolean
  /** Called with the entity id after a restore (a task moved across scopes gets a new id). */
  onRestored?: (id: string) => void
  /** Shown open inside a panel-slot occupant (ux-overhaul): no disclosure button. */
  embedded?: boolean
}) {
  const dt = useDateTimeFormat()
  useFieldDefs()
  const [open, setOpen] = useState(embedded)
  const [sets, setSets] = useState<ChangeSet[]>([])
  const [before, setBefore] = useState<number | undefined>()
  const [state, setState] = useState<'idle' | 'loading' | 'offline' | 'error' | 'empty'>('idle')
  const [device, setDevice] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  // Names for reference fields (assignee, project, section, parent task), from local data.
  const refNames = useLiveQuery(async () => {
    const m = new Map<string, string>()
    for (const ms of await db.memberships.toArray()) for (const u of ms.members) m.set(`assignee_id:${u.userId}`, u.name || u.email)
    for (const p of await db.projects.toArray()) m.set(`project_id:${p.id}`, p.name)
    for (const x of await db.sections.toArray()) m.set(`section_id:${x.id}`, x.name)
    const parents = [...new Set(sets.flatMap((cs) => cs.changes.filter((c) => c.field === 'parent_id').flatMap((c) => [c.from, c.to]).filter((v): v is string => typeof v === 'string')))]
    for (const t of await db.tasks.bulkGet(parents)) if (t) m.set(`parent_id:${t.id}`, t.title)
    return m
  }, [sets], new Map<string, string>())
  const fmt = (field: string, value: unknown) => formatValue(field, value, (f, ref) => refNames.get(`${f}:${ref}`))

  const load = useCallback(async (older?: number) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSets([])
      setState('offline')
      return
    }
    setState('loading')
    try {
      const page = await fetchHistory(entity, id, older)
      const newest = [...page.changeSets].reverse()
      setSets((prev) => (older ? [...prev, ...newest] : newest))
      setBefore(page.more ? page.before : undefined)
      setState('idle')
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        setSets([])
        setState('empty')
      } else if (isNetworkError(err)) {
        setSets([])
        setState('offline')
      } else setState('error')
    }
  }, [entity, id])

  useEffect(() => {
    void getDeviceId().then(setDevice)
  }, [])

  useEffect(() => {
    setSets([])
    setBefore(undefined)
    setMessage(null)
    if (open) void load()
  }, [open, load])

  async function restore(field: string, value: unknown) {
    setMessage(null)
    try {
      const next = await restoreValue(entity, id, field, value)
      setMessage(`Restored ${field}.`)
      onRestored?.(next)
      // The restore is a new op: once it reached the server it is in the history too.
      await syncNow()
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <section className={embedded ? '' : 'pt-4'} aria-label="History">
      {!embedded && (
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-0.5 text-meta" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <Icon name="chevron-right" size="xs" className={`transition-transform duration-(--duration-ui) ${open ? 'rotate-90' : ''}`} />History
        </button>
      )}
      {open && (
        <div className="mt-2 text-body">
          {state === 'offline' && <p className="text-meta text-muted">History needs a connection to the server.</p>}
          {state === 'error' && <p className="text-meta text-danger">History could not be loaded.</p>}
          {state === 'empty' && <p className="text-meta text-muted">No history on the server yet.</p>}
          {state === 'loading' && sets.length === 0 && <Skeleton shape="line" count={4} label="Loading history" />}
          {message && <p role="status" className="mb-1 text-meta text-success">{message}</p>}
          <ol className="space-y-2" aria-label="Changes">
            {sets.map((s) => (
              <li key={`${s.ts}:${s.device}`} className="border-l-2 border-default pl-2">
                <div className="text-meta text-faint">{dt.formatInstant(s.ts, 'datetime')} · {deviceLabel(s, device)}</div>
                <ul>
                  {s.changes.map((c) => (
                    <li key={c.opId} className={`flex flex-wrap items-baseline gap-x-1 ${c.lost ? 'text-faint' : ''}`}>
                      <span className="font-medium">{fieldLabel(c.field)}</span>
                      <span className="break-all">{fmt(c.field, c.from)} → {fmt(c.field, c.to)}</span>
                      {c.lost && <Tooltip label="Arrived after a newer change and was never applied"><span className="rounded-chip text-meta italic" tabIndex={0}>(lost)</span></Tooltip>}
                      {!readOnly && canRestoreField(entity, c.field) && (
                        <button type="button" className="ml-auto text-meta text-accent underline"
                          aria-label={`Restore ${fieldLabel(c.field)} to ${fmt(c.field, c.to)}`} onClick={() => void restore(c.field, c.to)}>
                          Restore this value
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          {before !== undefined && (
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm mt-1 text-meta" onClick={() => void load(before)}>Older changes</button>
          )}
        </div>
      )}
    </section>
  )
}
