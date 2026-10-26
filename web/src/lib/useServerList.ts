// The state behind an integration panel (wave 4, W1): an owner switch that gates a
// list of server rows (issue connections, notification channels, calendar
// connections). Offline, the last rows this device cached stay shown with the
// actions off; online, the switch and the list load from the server.
import { useCallback, useEffect, useRef, useState } from 'react'
import { isNetworkError } from './api'
import { errorText } from './errorText'
import { useOnline } from './online'
import { useAction, type Action, type ActionOptions } from './useAction'

export interface ServerListOptions<S extends { enabled: boolean }, T extends { id: string }> {
  /** Reads the owner switch (and any setting that comes with it). */
  setting: () => Promise<S>
  /** Called with the setting as it arrives, before the list is read. */
  onSetting?: (s: S) => void
  /** Reads the rows, only when the switch is on. */
  list: () => Promise<T[]>
  /** Runs after the rows were read (a further owner-only setting). */
  afterList?: (s: S) => Promise<void>
  /** The rows this device kept from the last load, and keeping them. */
  cached: () => Promise<T[]>
  cache: (rows: T[]) => Promise<void>
  /** Reload when this changes (it changes what afterList reads). */
  reloadKey?: unknown
  /** The panel's own action options; a network failure also marks the server unreachable. */
  action?: ActionOptions
}

export interface ServerList<T> extends Action {
  enabled: boolean | null
  setEnabled: (on: boolean) => void
  rows: T[] | null
  /** Replaces the rows and caches them on the device. */
  keep: (rows: T[]) => void
  /** Adds a row, or replaces the row with its id. */
  upsert: (row: T) => void
  remove: (id: string) => void
  /** Online and the server answered the last request. */
  connected: boolean
  load: () => Promise<void>
}

export function useServerList<S extends { enabled: boolean }, T extends { id: string }>(opts: ServerListOptions<S, T>): ServerList<T> {
  const online = useOnline()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [rows, setRows] = useState<T[] | null>(null)
  const [unreachable, setUnreachable] = useState(false)
  const action = useAction({
    ...opts.action,
    onError: (err) => {
      if (isNetworkError(err)) setUnreachable(true)
      opts.action?.onError?.(err)
    },
  })
  const { setError } = action
  // The latest server calls, read when they run.
  const calls = useRef(opts)
  calls.current = opts
  const { reloadKey } = opts

  const keep = useCallback((next: T[]) => {
    setRows(next)
    void calls.current.cache(next).catch(() => undefined)
  }, [])
  const load = useCallback(async () => {
    const c = calls.current
    try {
      const s = await c.setting()
      setEnabled(s.enabled)
      c.onSetting?.(s)
      setUnreachable(false)
      if (s.enabled) keep(await c.list())
      await c.afterList?.(s)
    } catch (err) {
      if (isNetworkError(err)) setUnreachable(true)
      else setError(errorText(err))
    }
  }, [keep, setError])
  useEffect(() => {
    void calls.current.cached().then((cached) => {
      if (cached.length) {
        setRows((cur) => cur ?? cached)
        setEnabled((cur) => cur ?? true)
      }
    }).catch(() => undefined)
  }, [])
  // Online again, or reloadKey changed (what afterList reads): load.
  useEffect(() => {
    if (online) void load()
  }, [online, load, reloadKey])

  const current = rows ?? []
  return {
    ...action,
    enabled,
    setEnabled,
    rows,
    keep,
    upsert: (row) => keep(current.some((x) => x.id === row.id) ? current.map((x) => (x.id === row.id ? row : x)) : [...current, row]),
    remove: (id) => keep(current.filter((x) => x.id !== id)),
    connected: online && !unreachable,
    load,
  }
}
