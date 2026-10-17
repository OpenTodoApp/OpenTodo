import { Icon } from '../ui'
import { Tooltip } from '../ui'
import { Skeleton } from '../ui'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useReferenceNames } from '../lib/localData'
import { isNetworkError } from '../lib/api'
import { canRestoreField, deviceLabel, fetchHistory, fieldLabel, formatValue, parentRefs, restoreValue } from '../lib/history'
import { getDeviceId } from '../lib/ops'
import { syncNow } from '../lib/sync'
import type { ChangeSet } from '../lib/types'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { useFieldDefs } from './useFields'
import { t } from '../lib/i18n'

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
  const parents = useMemo(() => parentRefs(sets), [sets])
  const refNames = useReferenceNames(parents)
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
      setMessage(t('Restored {field}.', { field: fieldLabel(field) }))
      onRestored?.(next)
      // The restore is a new op: once it reached the server it is in the history too.
      await syncNow()
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <section className={embedded ? '' : 'pt-4'} aria-label={t('History')}>
      {!embedded && (
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-0.5 text-meta" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <Icon name="chevron-right" size="xs" className={`transition-transform duration-(--duration-ui) ${open ? 'rotate-90' : ''}`} />{t('History')}
        </button>
      )}
      {open && (
        <div className="mt-2 text-body">
          {state === 'offline' && <p className="text-meta text-muted">{t('History needs a connection to the server.')}</p>}
          {state === 'error' && <p className="text-meta text-danger">{t('History could not be loaded.')}</p>}
          {state === 'empty' && <p className="text-meta text-muted">{t('No history on the server yet.')}</p>}
          {state === 'loading' && sets.length === 0 && <Skeleton shape="line" count={4} label={t('Loading history')} />}
          {message && <p role="status" className="mb-1 text-meta text-success">{message}</p>}
          <ol className="space-y-2" aria-label={t('Changes')}>
            {sets.map((s) => (
              <li key={`${s.ts}:${s.device}`} className="border-l-2 border-default pl-2">
                <div className="text-meta text-faint">{dt.formatInstant(s.ts, 'datetime')} · {deviceLabel(s, device)}</div>
                <ul>
                  {s.changes.map((c) => (
                    <li key={c.opId} className={`flex flex-wrap items-baseline gap-x-1 ${c.lost ? 'text-faint' : ''}`}>
                      <span className="font-medium">{fieldLabel(c.field)}</span>
                      <span className="break-all">{fmt(c.field, c.from)} → {fmt(c.field, c.to)}</span>
                      {c.lost && <Tooltip label={t('Arrived after a newer change and was never applied')}><span className="rounded-chip text-meta italic" tabIndex={0}>{t('(lost)')}</span></Tooltip>}
                      {!readOnly && canRestoreField(entity, c.field) && (
                        <button type="button" className="ml-auto text-meta text-accent underline"
                          aria-label={t('Restore this value: {field}, {value}', { field: fieldLabel(c.field), value: fmt(c.field, c.to) })} onClick={() => void restore(c.field, c.to)}>
                          {t('Restore this value')}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          {before !== undefined && (
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm mt-1 text-meta" onClick={() => void load(before)}>{t('Older changes')}</button>
          )}
        </div>
      )}
    </section>
  )
}
