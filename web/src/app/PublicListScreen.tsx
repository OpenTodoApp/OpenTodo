// The page behind a public link (OpenSpec change public-links, "Public page"): a
// project's open tasks for anyone with the link, ticked from here when the link
// allows it. No sign-in, no sync and no local copy: the list is read from the
// server, refreshed every 30 seconds while the page is visible and after a tick.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { hueFor, Notice } from '../ui'
import { ApiError, isNetworkError, publicApi } from '../lib/api'
import { formatShort, formatTime } from '../lib/dates'
import type { PublicList } from '../lib/types'

/** Refresh interval while the page is visible. */
export const PUBLIC_REFRESH_MS = 30_000

type Task = PublicList['tasks'][number]
type State =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'rate-limited' }
  | { kind: 'unreachable' }
  | { kind: 'ready'; list: PublicList }

/** Sections in order, each with its top-level tasks and their subtasks under them. */
export function publicGroups(list: PublicList): { id: string | null; name: string | null; rows: { task: Task; depth: number }[] }[] {
  const byPos = (a: Task, b: Task) => a.position - b.position
  const ids = new Set(list.tasks.map((t) => t.id))
  const children = new Map<string, Task[]>()
  for (const t of list.tasks) if (t.parent_id && ids.has(t.parent_id)) children.set(t.parent_id, [...(children.get(t.parent_id) ?? []), t])
  const walk = (t: Task, depth: number, out: { task: Task; depth: number }[]) => {
    out.push({ task: t, depth })
    for (const c of (children.get(t.id) ?? []).sort(byPos)) walk(c, depth + 1, out)
  }
  const top = list.tasks.filter((t) => !t.parent_id || !ids.has(t.parent_id))
  const sections = [{ id: null as string | null, name: null as string | null }, ...[...list.sections].sort((a, b) => a.position - b.position)]
  const known = new Set(list.sections.map((s) => s.id))
  return sections.map((s) => {
    const rows: { task: Task; depth: number }[] = []
    for (const t of top.filter((x) => (s.id === null ? !x.section_id || !known.has(x.section_id) : x.section_id === s.id)).sort(byPos)) walk(t, 0, rows)
    return { id: s.id, name: s.name, rows }
  }).filter((g) => g.rows.length > 0)
}

export function PublicListScreen({ token }: { token: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [stale, setStale] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Ticks waiting for the server: shown at once, rolled back if refused.
  const [pending, setPending] = useState<Record<string, boolean>>({})
  const busy = useRef(0)

  const load = useCallback(async () => {
    try {
      const list = await publicApi.list(token)
      setState({ kind: 'ready', list })
      setUpdatedAt(Date.now())
      setStale(false)
    } catch (err) {
      if (isNetworkError(err)) {
        // Keep the last list on screen; say it could not refresh.
        setStale(true)
        setState((s) => (s.kind === 'ready' ? s : { kind: 'unreachable' }))
      } else if (err instanceof ApiError && err.code === 'rate_limited') setState((s) => (s.kind === 'ready' ? s : { kind: 'rate-limited' }))
      else setState({ kind: 'invalid' })
    }
  }, [token])

  useEffect(() => {
    void load()
    const tick = () => { if (document.visibilityState === 'visible' && busy.current === 0) void load() }
    const id = setInterval(tick, PUBLIC_REFRESH_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [load])

  async function toggle(t: Task, completed: boolean) {
    setError(null)
    setPending((p) => ({ ...p, [t.id]: completed }))
    busy.current++
    try {
      await publicApi.tick(token, t.id, completed)
      await load()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'link_invalid') setState({ kind: 'invalid' })
      else setError(isNetworkError(err) ? 'The server could not be reached, so the change was not saved. Try again when you are online.'
        : err instanceof ApiError && err.code === 'rate_limited' ? 'Too many changes at once. Wait a moment and try again.'
          : 'This change could not be saved.')
    } finally {
      busy.current--
      setPending((p) => { const n = { ...p }; delete n[t.id]; return n })
    }
  }

  const list = state.kind === 'ready' ? state.list : null
  const groups = useMemo(() => (list ? publicGroups(list) : []), [list])

  return (
    <main className="min-h-full bg-canvas" data-screen="public/list">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8">
        {state.kind === 'loading' && <p className="text-meta text-muted">Loading the list…</p>}
        {state.kind === 'invalid' && (
          <div className="space-y-2 rounded-card border border-default bg-surface p-6" data-public-invalid>
            <h1 className="text-h2 font-semibold text-strong">This link no longer works</h1>
            <p className="text-body text-muted">It may have been revoked or have expired. Ask whoever shared it for a new one.</p>
          </div>
        )}
        {state.kind === 'rate-limited' && <Notice tone="warning">Too many requests from this network. Wait a minute, then reload the page.</Notice>}
        {state.kind === 'unreachable' && <Notice tone="warning">The server could not be reached. The list appears when the connection returns.</Notice>}
        {list && (
          <>
            <header className="mb-4 flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full bg-hue-solid" data-hue={hueFor(list.projectColor)} aria-hidden />
              <h1 className="user-text min-w-0 truncate text-h2 font-semibold text-strong">{list.projectName}</h1>
            </header>
            <Notice tone={list.rights === 'tick' ? 'warning' : 'info'}>
              {list.rights === 'tick'
                ? 'This list is public: anyone with the link can see it and tick items.'
                : 'This list is public and read-only: anyone with the link can see it.'}
            </Notice>
            {error && <div className="mt-2"><Notice tone="danger">{error}</Notice></div>}
            <div className="mt-4 space-y-5">
              {groups.length === 0 && <p className="text-body text-muted">Nothing left to do on this list.</p>}
              {groups.map((g) => (
                <section key={g.id ?? 'none'} aria-label={g.name ?? 'Tasks'}>
                  {g.name && <h2 className="user-text mb-1 text-hint font-semibold uppercase tracking-wide text-muted">{g.name}</h2>}
                  <ul className="divide-y divide-default rounded-card border border-default bg-surface">
                    {g.rows.map(({ task: t, depth }) => {
                      const done = t.id in pending ? pending[t.id] : t.completed_at !== null
                      const due = t.due ? `${formatShort(t.due.date)}${t.due.time ? ` ${formatTime(t.due.time)}` : ''}` : null
                      const body = (
                        <>
                          <span className={`user-text min-w-0 flex-1 break-words text-body ${done ? 'text-faint line-through' : 'text-default'}`}>{t.title || 'Untitled'}</span>
                          {due && <span className="shrink-0 text-meta tabular-nums text-muted">{due}</span>}
                          {t.priority < 4 && <span className="shrink-0 rounded-chip bg-sunken px-1.5 text-hint font-semibold text-muted" aria-label={`Priority ${t.priority}`}>P{t.priority}</span>}
                        </>
                      )
                      return (
                        <li key={t.id} data-public-task={t.id} data-done={done || undefined} style={{ paddingLeft: depth * 20 }}>
                          {list.rights === 'tick' ? (
                            <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1">
                              <span className="flex h-11 w-11 shrink-0 items-center justify-center">
                                <input type="checkbox" className="h-5 w-5 accent-(--ot-accent)" checked={done}
                                  aria-label={`${done ? 'Reopen' : 'Tick'} ${t.title || 'Untitled'}`}
                                  onChange={(e) => void toggle(t, e.target.checked)} />
                              </span>
                              {body}
                            </label>
                          ) : (
                            <div className="flex min-h-11 items-center gap-3 px-3 py-2">{body}</div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
            <p className="mt-4 text-meta text-faint" role="status" data-public-updated>
              {stale ? 'Could not refresh: you seem to be offline. Showing the last list; it updates when the connection returns.' : updatedAt ? `Updated ${formatTime(`${String(new Date(updatedAt).getHours()).padStart(2, '0')}:${String(new Date(updatedAt).getMinutes()).padStart(2, '0')}`)}` : ''}
            </p>
            <p className="mt-6 text-hint text-faint">Shared with OpenTodo. Notes, labels and names of the people on this project are not shown.</p>
          </>
        )}
      </div>
    </main>
  )
}
