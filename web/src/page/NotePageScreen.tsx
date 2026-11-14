// A note page (OpenSpec change note-public-links, "The note page"): one note, built
// for reading, opened without an account. A live page comes from the server; an
// encrypted one is decrypted here with the key after `#` in the link (design D4).
// The page keeps no copy of the note and refreshes every 60 seconds while visible.
// Links to other notes, tasks and projects arrive as their text and lead nowhere.
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MarkdownView, type MarkdownEmbeds } from '../app/MarkdownView'
import { relativeTime } from '../lib/dates'
import { t } from '../lib/i18n'
import { PageError, pageApi } from '../lib/taskPageApi'
import { decryptSnapshot, shareKeyFromFragment } from '../lib/taskPageCrypto'
import type { NotePageContent } from '../lib/types'
import { Icon } from '../ui/Icon'
import { Notice } from '../ui/patterns/Notice'
import { Ended, Shell, TaskPageScreen } from './TaskPageScreen'

/** How often the page refreshes while visible. */
export const NOTE_REFRESH_MS = 60_000

type State =
  | { kind: 'loading' }
  | { kind: 'gone' }
  | { kind: 'locked' }
  | { kind: 'task' }
  | { kind: 'ready'; content: NotePageContent; encrypted: boolean; serverTime: number }

export function NotePageScreen({ secret, fragment }: { secret: string; fragment: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [offline, setOffline] = useState(false)
  const keyRef = useRef<CryptoKey | null | undefined>(undefined)

  const load = useCallback(async () => {
    try {
      const res = await pageApi.get(secret)
      // The secret decides the layout: a task page's link opens the task page.
      if (res.kind !== 'note') return setState({ kind: 'task' })
      if (res.mode === 'live') {
        const { kind: _kind, mode: _mode, rights: _rights, serverTime, label: _label, ...content } = res
        setState({ kind: 'ready', content, encrypted: false, serverTime })
      } else {
        if (keyRef.current === undefined) keyRef.current = await shareKeyFromFragment(fragment)
        if (!keyRef.current) return setState({ kind: 'locked' })
        try {
          const content = await decryptSnapshot<NotePageContent>(keyRef.current, res.snapshot)
          setState({ kind: 'ready', content: { ...content, links: [], files: [] }, encrypted: true, serverTime: res.serverTime })
        } catch {
          setState({ kind: 'locked' })
        }
      }
      setOffline(false)
    } catch (err) {
      if (err instanceof PageError && err.status === 404) setState({ kind: 'gone' })
      else setOffline(true) // keep what is shown
    }
  }, [secret, fragment])

  useEffect(() => {
    void load()
    const tick = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, NOTE_REFRESH_MS)
    const again = () => { if (document.visibilityState === 'visible') void load() }
    window.addEventListener('online', again)
    document.addEventListener('visibilitychange', again)
    return () => {
      window.clearInterval(tick)
      window.removeEventListener('online', again)
      document.removeEventListener('visibilitychange', again)
    }
  }, [load])

  const embeds = useMemo<MarkdownEmbeds | undefined>(() => {
    if (state.kind !== 'ready') return undefined
    const { content, encrypted } = state
    return {
      Image: ({ id, alt }) => {
        const file = content.files.find((f) => f.id === id && f.image)
        if (encrypted || !file) return <p className="text-meta text-muted" data-page-omitted>{encrypted ? t('Images and files are not shown on encrypted pages') : alt}</p>
        return <img src={pageApi.fileUrl(secret, file.id)} alt={alt || file.name} loading="lazy" referrerPolicy="no-referrer" className="h-auto max-w-full rounded-card" data-page-image />
      },
      RefLink: ({ children }: { children: ReactNode }) => <>{children}</>,
    }
  }, [state, secret])

  if (state.kind === 'task') return <TaskPageScreen secret={secret} fragment={fragment} />
  // data-story-pending: the workbench waits for the first answer before capturing.
  if (state.kind === 'loading') return <Shell><p className="text-body text-muted" data-story-pending>{t('Loading…')}</p></Shell>
  if (state.kind === 'gone') return <Shell><Ended title={t('This page is no longer available')} body={t('The link was revoked or has expired. Ask the person who sent it for a new one.')} /></Shell>
  if (state.kind === 'locked') return <Shell><Ended title={t('This page cannot be opened without the full link')} body={t('Part of the link is missing or changed. Open the complete link you were sent, including everything after the # sign.')} /></Shell>

  const { content, encrypted, serverTime } = state
  const embedded = new Set([...content.text.matchAll(/\]\(attachment:([A-Za-z0-9_-]+)\)/g)].map((m) => m[1]))
  const files = content.files.filter((f) => !(f.image && embedded.has(f.id)))
  return (
    <Shell>
      <article className="space-y-6" aria-labelledby="page-title" data-note-page-view>
        <header className="space-y-2">
          <h1 id="page-title" className="text-h1 font-semibold text-default">{content.title.trim() || t('Untitled note')}</h1>
          {content.changedAt > 0 && <p className="text-meta text-muted">{t('Changed {when}', { when: relativeTime(content.changedAt, Math.max(serverTime, content.changedAt)) })}</p>}
        </header>
        <Notice>{t('Anyone with the link can read this note. It is read-only.')}</Notice>
        {offline && <Notice tone="warning">{t('Could not refresh. Showing the note as it was last loaded.')}</Notice>}
        {content.text.trim() && <section aria-label={t('Note')} className="min-w-0 break-words"><MarkdownView source={content.text} className="text-body text-default" embeds={embeds} /></section>}
        {encrypted && content.omitted && !embedded.size && <p className="text-meta text-muted" data-page-omitted>{t('Images and files are not shown on encrypted pages')}</p>}
        {(content.links.length > 0 || files.length > 0) && (
          <section aria-labelledby="page-attachments" className="space-y-1">
            <h2 id="page-attachments" className="text-meta font-medium text-muted">{t('Attachments')}</h2>
            <ul className="space-y-1">
              {content.links.map((l) => (
                <li key={l.id}><a className="inline-flex min-h-11 items-center gap-2 text-body text-accent underline" href={l.url} target="_blank" rel="nofollow noopener noreferrer"><Icon name="link" />{l.name || l.url}</a></li>
              ))}
              {files.map((f) => (
                <li key={f.id}><a className="inline-flex min-h-11 items-center gap-2 break-all text-body text-accent underline" href={`${pageApi.fileUrl(secret, f.id)}?download=1`} download={f.name}><Icon name="paperclip" />{f.name}</a></li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </Shell>
  )
}

export default NotePageScreen
