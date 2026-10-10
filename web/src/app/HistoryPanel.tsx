import { useCallback, useEffect, useState } from 'react'
import { isNetworkError } from '../lib/api'
import { canRestoreField, deviceLabel, fetchHistory, formatValue, restoreValue } from '../lib/history'
import { getDeviceId } from '../lib/ops'
import { syncNow } from '../lib/sync'
import type { ChangeSet } from '../lib/types'

/**
 * Revision history of a task or project (OpenSpec `trash-and-history`): a timeline
 * of change sets read live from the server's op log, newest first, with "restore
 * this value" on each field change. Offline it says so and shows nothing stale.
 */
export function HistoryPanel({ entity, id, readOnly = false, onRestored }: {
  entity: 'task' | 'project'
  id: string
  readOnly?: boolean
  /** Called with the entity id after a restore (a task moved across scopes gets a new id). */
  onRestored?: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [sets, setSets] = useState<ChangeSet[]>([])
  const [before, setBefore] = useState<number | undefined>()
  const [state, setState] = useState<'idle' | 'loading' | 'offline' | 'error' | 'empty'>('idle')
  const [device, setDevice] = useState('')
  const [message, setMessage] = useState<string | null>(null)

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
      if (isNetworkError(err)) {
        setSets([])
        setState('offline')
      } else if ((err as { status?: number }).status === 404) {
        setSets([])
        setState('empty')
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
    <section className="pt-4" aria-label="History">
      <button type="button" className="btn-ghost px-2 py-0.5 text-xs" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? '▾' : '▸'} History
      </button>
      {open && (
        <div className="mt-2 text-sm">
          {state === 'offline' && <p className="text-xs text-slate-500">History needs a connection to the server.</p>}
          {state === 'error' && <p className="text-xs text-red-600">History could not be loaded.</p>}
          {state === 'empty' && <p className="text-xs text-slate-500">No history on the server yet.</p>}
          {state === 'loading' && sets.length === 0 && <p className="text-xs text-slate-400">Loading…</p>}
          {message && <p role="status" className="mb-1 text-xs text-emerald-700 dark:text-emerald-300">{message}</p>}
          <ol className="space-y-2" aria-label="Changes">
            {sets.map((s) => (
              <li key={`${s.ts}:${s.device}`} className="border-l-2 border-slate-200 pl-2 dark:border-slate-700">
                <div className="text-xs text-slate-400">{new Date(s.ts).toLocaleString()} · {deviceLabel(s, device)}</div>
                <ul>
                  {s.changes.map((c) => (
                    <li key={c.opId} className={`flex flex-wrap items-baseline gap-x-1 ${c.lost ? 'text-slate-400' : ''}`}>
                      <span className="font-medium">{c.field}</span>
                      <span className="break-all">{formatValue(c.field, c.from)} → {formatValue(c.field, c.to)}</span>
                      {c.lost && <span className="text-xs italic" title="Arrived after a newer change and was never applied">(lost)</span>}
                      {!readOnly && canRestoreField(entity, c.field) && (
                        <button type="button" className="ml-auto text-xs text-emerald-700 underline dark:text-emerald-300"
                          aria-label={`Restore ${c.field} to ${formatValue(c.field, c.to)}`} onClick={() => void restore(c.field, c.to)}>
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
            <button type="button" className="btn-ghost mt-1 text-xs" onClick={() => void load(before)}>Older changes</button>
          )}
        </div>
      )}
    </section>
  )
}
