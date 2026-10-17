// The page behind a public link (OpenSpec change public-links, "Public page"): a
// project's open tasks for anyone with the link, ticked from here when the link
// allows it. No sign-in, no sync and no local copy: the list is read from the
// server, refreshed every 30 seconds while the page is visible and after a tick.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Clock, useNow } from './display/Clock'
import { DisplayColumn, type DisplayRowData } from './display/DisplayColumn'
import { parseDisplayOptions, type DisplayOptions } from './display/displayOptions'
import { useDisplayKeys, useRootPresentation, useWakeLock } from './display/displayHooks'
import { hueFor, Notice } from '../ui'
import { ApiError, isNetworkError, publicApi } from '../lib/api'
import { formatShort, formatTime } from '../lib/dates'
import type { PublicList } from '../lib/types'
import { t, msg, translatedMap } from '../lib/i18n'
import { appendTo } from '../lib/collections'

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
  const ids = new Set(list.tasks.map((item) => item.id))
  const children = new Map<string, Task[]>()
  for (const entry of list.tasks) if (entry.parent_id && ids.has(entry.parent_id)) appendTo(children, entry.parent_id, entry)
  const walk = (x1: Task, depth: number, out: { task: Task; depth: number }[]) => {
    out.push({ task: x1, depth })
    for (const c of (children.get(x1.id) ?? []).sort(byPos)) walk(c, depth + 1, out)
  }
  const top = list.tasks.filter((item) => !item.parent_id || !ids.has(item.parent_id))
  const sections = [{ id: null as string | null, name: null as string | null }, ...[...list.sections].sort((a, b) => a.position - b.position)]
  const known = new Set(list.sections.map((s) => s.id))
  return sections.map((s) => {
    const rows: { task: Task; depth: number }[] = []
    for (const item of top.filter((x) => (s.id === null ? !x.section_id || !known.has(x.section_id) : x.section_id === s.id)).sort(byPos)) walk(item, 0, rows)
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

  async function toggle(item: Task, completed: boolean) {
    setError(null)
    setPending((p) => ({ ...p, [item.id]: completed }))
    busy.current++
    try {
      await publicApi.tick(token, item.id, completed)
      await load()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'link_invalid') setState({ kind: 'invalid' })
      else setError(isNetworkError(err) ? t('The server could not be reached, so the change was not saved. Try again when you are online.')
        : err instanceof ApiError && err.code === 'rate_limited' ? t('Too many changes at once. Wait a moment and try again.')
          : t('This change could not be saved.'))
    } finally {
      busy.current--
      setPending((p) => { const n = { ...p }; delete n[item.id]; return n })
    }
  }

  const list = state.kind === 'ready' ? state.list : null
  const groups = useMemo(() => (list ? publicGroups(list) : []), [list])
  // Display mode (display-mode "Public link display"): `display=1` with the presentation options.
  const [display] = useState(() => publicDisplayOptions(typeof location === 'undefined' ? '' : location.search))
  const updatedLine = stale ? t('Could not refresh: you seem to be offline. Showing the last list; it updates when the connection returns.') : updatedAt ? t('Updated {time}', { time: formatTime(`${String(new Date(updatedAt).getHours()).padStart(2, '0')}:${String(new Date(updatedAt).getMinutes()).padStart(2, '0')}`) }) : ''

  if (display) {
    return <PublicDisplay options={display} state={state} groups={groups} pending={pending} error={error} updatedLine={updatedLine} onToggle={(entry, done) => void toggle(entry, done)} />
  }

  return (
    <main className="min-h-full bg-canvas" data-screen="public/list">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8">
        {state.kind === 'loading' && <p className="text-meta text-muted">{t('Loading the list…')}</p>}
        {state.kind === 'invalid' && (
          <div className="space-y-2 rounded-card border border-default bg-surface p-6" data-public-invalid>
            <h1 className="text-h2 font-semibold text-strong">{t('This link no longer works')}</h1>
            <p className="text-body text-muted">{t('It may have been revoked or have expired. Ask whoever shared it for a new one.')}</p>
          </div>
        )}
        {state.kind === 'rate-limited' && <Notice tone="warning">{t('Too many requests from this network. Wait a minute, then reload the page.')}</Notice>}
        {state.kind === 'unreachable' && <Notice tone="warning">{t('The server could not be reached. The list appears when the connection returns.')}</Notice>}
        {list && (
          <>
            <header className="mb-4 flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full bg-hue-solid" data-hue={hueFor(list.projectColor)} aria-hidden />
              <h1 className="user-text min-w-0 truncate text-h2 font-semibold text-strong">{list.projectName}</h1>
            </header>
            <Notice tone={list.rights === 'tick' ? 'warning' : 'info'}>
              {list.rights === 'tick'
                ? t('This list is public: anyone with the link can see it and tick items.')
                : t('This list is public and read-only: anyone with the link can see it.')}
            </Notice>
            {error && <div className="mt-2"><Notice tone="danger">{error}</Notice></div>}
            <div className="mt-4 space-y-5">
              {groups.length === 0 && <p className="text-body text-muted">{t('Nothing left to do on this list.')}</p>}
              {groups.map((g) => (
                <section key={g.id ?? 'none'} aria-label={g.name ?? t('Tasks')}>
                  {g.name && <h2 className="user-text mb-1 text-hint font-semibold uppercase tracking-wide text-muted">{g.name}</h2>}
                  <ul className="divide-y divide-default rounded-card border border-default bg-surface">
                    {g.rows.map(({ task: x1, depth }) => {
                      const done = x1.id in pending ? pending[x1.id] : x1.completed_at !== null
                      const due = x1.due ? `${formatShort(x1.due.date)}${x1.due.time ? ` ${formatTime(x1.due.time)}` : ''}` : null
                      const body = (
                        <>
                          <span className={`user-text min-w-0 flex-1 break-words text-body ${done ? 'text-faint line-through' : 'text-default'}`}>{x1.title || t('Untitled')}</span>
                          {due && <span className="shrink-0 text-meta tabular-nums text-muted">{due}</span>}
                          {x1.priority < 4 && <span className="shrink-0 rounded-chip bg-sunken px-1.5 text-hint font-semibold text-muted" aria-label={t('Priority {priority}', { priority: x1.priority })}>P{x1.priority}</span>}
                        </>
                      )
                      return (
                        <li key={x1.id} data-public-task={x1.id} data-done={done || undefined} style={{ paddingLeft: depth * 20 }}>
                          {list.rights === 'tick' ? (
                            <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1">
                              <span className="flex h-11 w-11 shrink-0 items-center justify-center">
                                <input type="checkbox" className="h-5 w-5 accent-(--ot-accent)" checked={done}
                                  aria-label={done ? t('Reopen {title}', { title: x1.title || t('Untitled') }) : t('Tick {title}', { title: x1.title || t('Untitled') })}
                                  onChange={(e) => void toggle(x1, e.target.checked)} />
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
            <p className="mt-4 text-meta text-faint" role="status" data-public-updated>{updatedLine}</p>
            <p className="mt-6 text-hint text-faint">{t('Shared with OpenTodo. Notes, labels and names of the people on this project are not shown.')}</p>
          </>
        )}
      </div>
    </main>
  )
}

/** The display options of a public page, or null without `display=1` (display-mode D7). */
export function publicDisplayOptions(search: string): DisplayOptions | null {
  const q = new URLSearchParams(search)
  return q.get('display') === '1' ? parseDisplayOptions(q) : null
}

const PUBLIC_NOTICE = translatedMap({
  tick: msg('This list is public: anyone with the link can see it and tick items.'),
  read: msg('This list is public and read-only: anyone with the link can see it.'),
})

/**
 * The public page on a display (display-mode D7): the display's type scale, clock
 * and rows, with the public notice; the data path stays the public read route and
 * its polling. Nothing is stored on the device.
 */
function PublicDisplay({ options, state, groups, pending, error, updatedLine, onToggle }: {
  options: DisplayOptions
  state: State
  groups: ReturnType<typeof publicGroups>
  pending: Record<string, boolean>
  error: string | null
  updatedLine: string
  onToggle: (item: Task, completed: boolean) => void
}) {
  const now = useNow(options.seconds)
  useRootPresentation(options)
  useWakeLock()
  const list = state.kind === 'ready' ? state.list : null
  const byId = useMemo(() => new Map((list?.tasks ?? []).map((entry) => [entry.id, entry])), [list])
  const columns = useMemo(() => groups.map((g) => ({
    id: g.id ?? 'none',
    heading: g.name,
    rows: g.rows.map(({ task: x1, depth }): DisplayRowData => ({
      key: `${g.id ?? 'none'}:${x1.id}`, id: x1.id, title: x1.title, priority: x1.priority, depth,
      done: x1.id in pending ? pending[x1.id] : x1.completed_at !== null,
      due: x1.due ? `${formatShort(x1.due.date)}${x1.due.time ? ` ${formatTime(x1.due.time)}` : ''}` : null,
      editable: list?.rights === 'tick',
    })),
  })), [groups, pending, list])
  const rows = useMemo(() => columns.flatMap((c) => c.rows), [columns])
  const toggle = useCallback((r: DisplayRowData) => {
    const item = byId.get(r.id)
    if (item && r.editable) onToggle(item, !r.done)
  }, [byId, onToggle])
  const { focusKey, setFocusKey } = useDisplayKeys(rows, toggle)

  return (
    <main className="display-root" data-screen="public/display" data-size={options.size}>
      <div className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col gap-6 px-4 py-4 md:px-8 md:py-6">
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <Clock now={now} seconds={options.seconds} />
          {list && <h1 className="display-title user-text min-w-0">{list.projectName}</h1>}
        </header>
        {state.kind === 'loading' && <p className="display-meta">{t('Loading the list…')}</p>}
        {state.kind === 'invalid' && <p className="display-task" data-public-invalid>{t('This link no longer works. Ask whoever shared it for a new one.')}</p>}
        {state.kind === 'rate-limited' && <Notice tone="warning">{t('Too many requests from this network. Wait a minute, then reload the page.')}</Notice>}
        {state.kind === 'unreachable' && <Notice tone="warning">{t('The server could not be reached. The list appears when the connection returns.')}</Notice>}
        {list && (
          <>
            <Notice tone={list.rights === 'tick' ? 'warning' : 'info'}>{PUBLIC_NOTICE[list.rights === 'tick' ? 'tick' : 'read']}</Notice>
            {error && <Notice tone="danger">{error}</Notice>}
            {columns.length === 0 ? (
              <p className="display-task">{t('Nothing left to do on this list.')}</p>
            ) : (
              <div className="space-y-6">
                {columns.map((c) => (
                  <DisplayColumn key={c.id} id={c.id} heading={c.heading} rows={c.rows} focusKey={focusKey} onFocusRow={setFocusKey} onToggle={toggle} />
                ))}
              </div>
            )}
          </>
        )}
        <p className="display-meta mt-auto" role="status" data-public-updated>{updatedLine}</p>
      </div>
    </main>
  )
}
