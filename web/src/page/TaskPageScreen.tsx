// A task page (OpenSpec change task-pages, "The task page"): one task, built for
// reading, opened without an account. A live page comes from the server; an
// encrypted one is decrypted here with the key after `#` in the link (design D3).
// The page keeps no copy of the task: it refreshes every 30 seconds while visible
// and after each action, and only the guest's typed name is stored in the browser.
import { type FormEvent, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Markdown } from '../app/Markdown'
import { formatDate, formatDueLong, formatInstant } from '../lib/dates'
import { t } from '../lib/i18n'
import { sha256 } from '../lib/ids'
import { PageError, pageApi } from '../lib/taskPageApi'
import { decryptSnapshot, encryptReply, shareKeyFromFragment } from '../lib/taskPageCrypto'
import type { TaskPageContent, TaskPageRights } from '../lib/types'
import { Button } from '../ui/Button'
import { Field, Input, Textarea } from '../ui/Field'
import { Icon } from '../ui/Icon'
import { Notice } from '../ui/patterns/Notice'

const MapView = lazy(() => import('../app/locations/MapView'))

/** How often the page refreshes while visible. */
export const REFRESH_MS = 30_000
/** How long after completion a guest may reopen the task. */
const REOPEN_MS = 24 * 60 * 60 * 1000

type State =
  | { kind: 'loading' }
  | { kind: 'gone' }
  | { kind: 'locked' }
  | { kind: 'ready'; content: TaskPageContent; rights: TaskPageRights; encrypted: boolean; updatedAt: number | null; serverTime: number }

/** The browser-local key of this page's guest name: a hash, never the secret itself. */
function nameKey(secret: string): string {
  const h = sha256(new TextEncoder().encode(`task-page:${secret}`))
  return `opentodo.taskPage.${Array.from(h.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('')}`
}

function storedName(secret: string): string {
  try { return localStorage.getItem(nameKey(secret)) ?? '' } catch { return '' }
}

function storeName(secret: string, name: string): void {
  try { localStorage.setItem(nameKey(secret), name) } catch { /* storage refused: asked again next time */ }
}

export function TaskPageScreen({ secret, fragment }: { secret: string; fragment: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [offline, setOffline] = useState(false)
  const [name, setName] = useState(() => storedName(secret))
  const [askName, setAskName] = useState(false)
  const [editName, setEditName] = useState(false)
  const [draft, setDraft] = useState('')
  const [pendingSent, setPendingSent] = useState(false)
  const [error, setError] = useState('')
  const keyRef = useRef<CryptoKey | null | undefined>(undefined)

  const load = useCallback(async () => {
    try {
      const res = await pageApi.get(secret)
      if (res.mode === 'live') {
        const { mode: _mode, rights, serverTime, label: _label, ...content } = res
        setState({ kind: 'ready', content, rights, encrypted: false, updatedAt: serverTime, serverTime })
      } else {
        if (keyRef.current === undefined) keyRef.current = await shareKeyFromFragment(fragment)
        if (!keyRef.current) return setState({ kind: 'locked' })
        try {
          const content = await decryptSnapshot<TaskPageContent>(keyRef.current, res.snapshot)
          setState({ kind: 'ready', content, rights: res.rights, encrypted: true, updatedAt: res.snapshotAt, serverTime: res.serverTime })
        } catch {
          setState({ kind: 'locked' })
        }
      }
      setOffline(false)
    } catch (err) {
      if (err instanceof PageError && err.status === 404) setState({ kind: 'gone' })
      else setOffline(true) // keep what is shown; actions wait for the connection
    }
  }, [secret, fragment])

  useEffect(() => {
    void load()
    const tick = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, REFRESH_MS)
    const again = () => { if (document.visibilityState === 'visible') void load() }
    window.addEventListener('online', again)
    document.addEventListener('visibilitychange', again)
    return () => {
      window.clearInterval(tick)
      window.removeEventListener('online', again)
      document.removeEventListener('visibilitychange', again)
    }
  }, [load])

  // data-story-pending: the workbench waits for the first answer before capturing.
  if (state.kind === 'loading') return <Shell><p className="text-body text-muted" data-story-pending>{t('Loading…')}</p></Shell>
  if (state.kind === 'gone') return <Shell><Ended title={t('This page is no longer available')} body={t('The link was revoked or has expired. Ask the person who sent it for a new one.')} /></Shell>
  if (state.kind === 'locked') return <Shell><Ended title={t('This page cannot be opened without the full link')} body={t('Part of the link is missing or changed. Open the complete link you were sent, including everything after the # sign.')} /></Shell>

  const { content, rights, encrypted } = state
  const canReply = rights !== 'view'
  const canTick = rights === 'tick'
  const actionsOff = offline
  const done = content.completed_at !== null
  const canReopen = done && state.serverTime - (content.completed_at ?? 0) < REOPEN_MS

  const withName = (run: (n: string) => Promise<void>) => async () => {
    setError('')
    if (!name.trim()) {
      setAskName(true)
      return
    }
    try {
      await run(name.trim())
      await load()
    } catch (err) {
      setError(err instanceof PageError && err.code === 'rate_limited' ? t('Too many replies on this page for now. Try again later.') : t('That did not go through. Check the connection and try again.'))
      if (err instanceof PageError && err.status === 404) setState({ kind: 'gone' })
    }
  }

  const send = withName(async (n) => {
    const body = draft.trim()
    if (!body) return
    if (encrypted) {
      await pageApi.reply(secret, { ciphertext: await encryptReply(keyRef.current!, { name: n, body, sentAt: Date.now() }) })
      setPendingSent(true)
    } else {
      await pageApi.reply(secret, { name: n, body })
    }
    setDraft('')
  })

  // A tick shows at once; the refresh after the request brings the server's answer
  // (and undoes the mark if the request failed).
  const tick = (taskId: string, completed: boolean) => withName(async (n) => {
    const at = completed ? Date.now() : null
    setState((s) => s.kind !== 'ready' ? s : {
      ...s, content: taskId === s.content.id
        ? { ...s.content, completed_at: at }
        : { ...s.content, subtasks: s.content.subtasks.map((x) => (x.id === taskId ? { ...x, completed_at: at } : x)) },
    })
    try {
      await pageApi.tick(secret, taskId, completed, encrypted ? '' : n)
    } catch (err) {
      await load()
      throw err
    }
  })()

  const saveName = (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim().slice(0, 40)
    if (!n) return
    storeName(secret, n)
    setName(n)
    setEditName(false)
    if (askName) {
      setAskName(false)
      if (draft.trim()) void send()
    }
  }

  return (
    <Shell>
      <article className="space-y-6" aria-labelledby="page-title">
        <header className="space-y-2">
          <h1 id="page-title" className={`text-h1 font-semibold text-default ${done ? 'text-muted line-through' : ''}`}>{content.title || t('Untitled')}</h1>
          <Dates content={content} />
          {done && <p className="text-meta text-success">{t('Done')}</p>}
        </header>
        <Notice>{canReply ? t('Anyone with the link can open this page. Your replies are visible to everyone who has it.') : t('Anyone with the link can open this page. It is read-only.')}</Notice>
        {offline && <Notice tone="warning">{t('Could not refresh. Replying and ticking are off until the connection is back.')}</Notice>}
        {content.description && <section aria-label={t('Description')}><Markdown source={content.description} className="text-body text-default" /></section>}
        {content.subtasks.length > 0 && (
          <section aria-labelledby="page-subtasks" className="space-y-1">
            <h2 id="page-subtasks" className="text-meta font-medium text-muted">{t('Checklist')}</h2>
            <ul className="space-y-1">
              {content.subtasks.map((s) => (
                <li key={s.id} style={{ paddingInlineStart: `${(s.depth - 1) * 1.25}rem` }}>
                  {canTick ? (
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-1 hover:bg-sunken">
                      <input type="checkbox" className="size-5 shrink-0" checked={s.completed_at !== null} disabled={actionsOff}
                        onChange={(e) => void tick(s.id, e.target.checked)} />
                      <span className={`text-body ${s.completed_at !== null ? 'text-muted line-through' : 'text-default'}`}>{s.title}</span>
                    </label>
                  ) : (
                    <p className="flex min-h-11 items-center gap-3 px-1 text-body">
                      <Icon name={s.completed_at !== null ? 'circle-check-big' : 'circle'} />
                      <span className={s.completed_at !== null ? 'text-muted line-through' : 'text-default'}>{s.title}</span>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        {(content.links.length > 0 || content.files.length > 0) && (
          <section aria-labelledby="page-attachments" className="space-y-1">
            <h2 id="page-attachments" className="text-meta font-medium text-muted">{t('Attachments')}</h2>
            <ul className="space-y-1">
              {content.links.map((l) => (
                <li key={l.id}><a className="inline-flex min-h-11 items-center gap-2 text-body text-accent underline" href={l.url} target="_blank" rel="nofollow noopener noreferrer"><Icon name="link" />{l.name || l.url}</a></li>
              ))}
              {content.files.map((f) => (
                <li key={f.id}><a className="inline-flex min-h-11 items-center gap-2 text-body text-accent underline" href={pageApi.fileUrl(secret, f.id)} download={f.name}><Icon name="paperclip" />{f.name}</a></li>
              ))}
            </ul>
          </section>
        )}
        {content.location && <Place secret={secret} location={content.location} />}
        {canTick && (
          <div>
            {!done && <Button variant="primary" icon="check" disabled={actionsOff} onClick={() => tick(content.id, true)} data-page-done>{t('Mark as done')}</Button>}
            {canReopen && <Button icon="rotate-ccw" disabled={actionsOff} onClick={() => tick(content.id, false)} data-page-reopen>{t('Reopen')}</Button>}
          </div>
        )}
        <section aria-labelledby="page-conversation" className="space-y-3">
          <h2 id="page-conversation" className="text-meta font-medium text-muted">{t('Conversation')}</h2>
          {content.comments.length === 0 && <p className="text-meta text-faint">{t('No replies yet.')}</p>}
          <ol className="space-y-3">
            {content.comments.map((c) => (
              <li key={c.id} className="space-y-1">
                <p className="text-meta text-muted"><strong className="font-medium text-default">{c.guest ? t('{name} (guest)', { name: c.name }) : c.name}</strong> · {formatInstant(c.createdAt, 'datetime')}</p>
                <Markdown source={c.body} className="text-body text-default" />
              </li>
            ))}
          </ol>
          {pendingSent && <p className="text-meta text-muted" role="status">{t('Sent. It appears here once the owner’s device picks it up.')}</p>}
          {canReply && (
            <div className="space-y-2">
              {askName || editName ? (
                <form onSubmit={saveName} className="flex flex-wrap items-end gap-2">
                  <Field label={t('Your name')} description={t('Shown with your replies, followed by “(guest)”.')} className="min-w-0 flex-1">
                    <Input value={name} maxLength={40} autoFocus onChange={(e) => setName(e.target.value)} />
                  </Field>
                  <Button type="submit" variant="primary">{t('Save name')}</Button>
                </form>
              ) : name ? (
                <p className="text-meta text-muted">{t('Replying as {name}', { name })} <button type="button" className="min-h-11 px-1 text-accent underline" onClick={() => setEditName(true)}>{t('Change')}</button></p>
              ) : null}
              <Field label={t('Reply')} hideLabel>
                <Textarea rows={3} value={draft} maxLength={4000} placeholder={t('Write a reply…')} disabled={actionsOff} onChange={(e) => setDraft(e.target.value)} />
              </Field>
              <Button variant="primary" icon="send" disabled={actionsOff || !draft.trim()} onClick={send} data-page-send>{t('Send')}</Button>
            </div>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
        </section>
        <footer className="text-meta text-faint">
          {state.updatedAt ? t('Updated {time}', { time: formatInstant(state.updatedAt, 'datetime') }) : null}
        </footer>
      </article>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-dvh w-full max-w-2xl bg-canvas px-4 py-8 sm:px-6">{children}</main>
}

function Ended({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-2" role="status">
      <h1 className="text-h1 font-semibold text-default">{title}</h1>
      <p className="text-body text-muted">{body}</p>
    </div>
  )
}

function Dates({ content }: { content: TaskPageContent }) {
  const parts = useMemo(() => {
    const out: string[] = []
    if (content.due) out.push(t('To do on {date}', { date: formatDueLong(content.due) }))
    if (content.deadline) out.push(t('Deadline {date}', { date: formatDate(content.deadline, 'long') }))
    return out
  }, [content.due, content.deadline])
  if (parts.length === 0) return null
  return <p className="text-body text-muted">{parts.join(' · ')}</p>
}

function Place({ secret, location }: { secret: string; location: NonNullable<TaskPageContent['location']> }) {
  const [mapOff, setMapOff] = useState(false)
  const label = location.name || location.address || t('Location')
  const hasPoint = typeof location.lat === 'number' && typeof location.lon === 'number'
  const osm = hasPoint ? `https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lon}#map=17/${location.lat}/${location.lon}` : null
  return (
    <section aria-labelledby="page-place" className="space-y-2">
      <h2 id="page-place" className="text-meta font-medium text-muted">{t('Where')}</h2>
      <p className="text-body text-default">{label}{location.address && location.name ? <span className="block text-meta text-muted">{location.address}</span> : null}</p>
      {hasPoint && !mapOff && (
        <Suspense fallback={null}>
          <MapView points={[{ lat: location.lat!, lon: location.lon!, label }]} label={t('Map of {place}', { place: label })}
            styleUrl={pageApi.mapStyleUrl(secret)} credentials="omit" onUnavailable={() => setMapOff(true)} className="h-56 w-full overflow-hidden rounded-card" />
        </Suspense>
      )}
      {osm && <a className="inline-flex min-h-11 items-center gap-2 text-meta text-accent underline" href={osm} target="_blank" rel="nofollow noopener noreferrer"><Icon name="external-link" />{t('Open in maps')}</a>}
    </section>
  )
}
