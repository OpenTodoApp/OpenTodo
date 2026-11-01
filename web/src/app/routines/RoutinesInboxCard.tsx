// The Inbox card "Routines since your last visit" (OpenSpec change
// routines-editor, design D10, spec routine-inbox): inside the Inbox list
// above the first task, only when it has lines; one line per routine, at most
// five, then "See all runs". It counts as seen after 2 seconds on screen or
// with Mark as seen (the synced marker moves to the newest displayed run);
// failures stay until handled, a success line can be dismissed on every device.
// Offline it shows what was last fetched. Loaded lazily, only for users with
// routines.
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { formatInstant } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { useOnline } from '../../lib/online'
import { cachedInbox, fetchInbox, inboxLines, markRoutinesSeen, MAX_LINES, SEEN_AFTER_MS, setHideSuccesses, useRoutinesSeen, type InboxLine } from '../../lib/rules/inbox'
import { useRules } from '../../lib/rules/store'
import { useSyncStatus } from '../../lib/sync'
import type { RoutineInboxRun } from '../../lib/types'
import { Button, Card, Icon, IconButton } from '../../ui'
import { act } from '../actionError'
import { ActionMenu, type ActionGroup } from '../menus/ActionMenu'
import { navigate } from '../router'

/** The card's view: its lines and actions (stories and tests render it directly). */
export function InboxCardView({ lines, more, hide, online, onOpen, onDismiss, onSeen, onHide, onAll }: {
  lines: InboxLine[]; more: number; hide: boolean; online: boolean
  onOpen: (line: InboxLine) => void; onDismiss: (line: InboxLine) => void; onSeen: () => void; onHide: (on: boolean) => void; onAll: () => void
}) {
  const groups: ActionGroup[] = [{ items: [
    { kind: 'action', id: 'seen', label: t('Mark as seen'), icon: 'check', onSelect: onSeen },
    { kind: 'action', id: 'hide', label: hide ? t('Show successful runs') : t('Hide successful runs'), icon: hide ? 'eye' : 'eye-off', onSelect: () => onHide(!hide) },
    { kind: 'action', id: 'all', label: t('See all runs'), icon: 'history', onSelect: onAll },
  ] }]
  return (
    <Card as="section" padding="none" className="mb-3 p-3" aria-labelledby="routines-inbox-title" data-routines-inbox>
      <div className="flex items-center gap-2">
        <Icon name="zap" className="text-accent" />
        <h2 id="routines-inbox-title" className="flex-1 text-body font-medium text-strong">{t('Routines since your last visit')}</h2>
        <Button size="sm" variant="ghost" onClick={onSeen}>{t('Mark as seen')}</Button>
        <ActionMenu label={t('Menu for routines since your last visit')} groups={groups} />
      </div>
      <ul className="mt-1 space-y-0.5">
        {lines.map((l) => (
          <li key={`${l.ruleId}:${l.kind}`} className="flex items-center gap-1" data-inbox-line={l.kind}>
            <button type="button" onClick={() => onOpen(l)}
              className={`user-text min-h-11 min-w-0 flex-1 truncate rounded-control px-2 text-left text-meta hover:bg-sunken dark:hover:bg-raised ${l.kind === 'failure' ? 'text-danger' : 'text-default'}`}>
              {l.text}
            </button>
            {l.kind === 'success' && (
              <IconButton icon="x" size="sm" variant="ghost" label={t('Dismiss {name}', { name: l.name })} disabled={!online} onClick={() => onDismiss(l)} />
            )}
          </li>
        ))}
      </ul>
      {more > 0 && <p className="px-2 text-meta text-muted">{t('{n, plural, one {# more routine} other {# more routines}}', { n: more })}</p>}
      <Button size="sm" variant="ghost" iconEnd="arrow-right" onClick={onAll}>{t('See all runs')}</Button>
    </Card>
  )
}

/** Whether the element is on screen (the whole page when IntersectionObserver is missing). */
function useOnScreen(ref: React.RefObject<HTMLElement | null>, active: boolean): boolean {
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (!active) return
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setSeen(true); return }
    const io = new IntersectionObserver((entries) => setSeen(entries.some((e) => e.isIntersecting)), { threshold: 0.5 })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, active])
  return seen
}

export default function RoutinesInboxCard() {
  const seen = useRoutinesSeen()
  const rules = useRules()
  const online = useOnline()
  const synced = useSyncStatus().lastSyncedAt
  const [runs, setRuns] = useState<RoutineInboxRun[] | null>(() => cachedInbox()?.runs ?? null)
  const [gone, setGone] = useState<Set<string>>(new Set())
  const [frozen, setFrozen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const marker = seen?.marker ?? 0
  // Fetched with the Inbox and after a sync; once the card counted as seen it keeps what it showed.
  useEffect(() => {
    if (!seen || !online || frozen) return
    let live = true
    fetchInbox(marker).then((a) => { if (live) setRuns(a.runs) }, () => undefined)
    return () => { live = false }
  }, [seen === undefined, online, synced, frozen]) // eslint-disable-line react-hooks/exhaustive-deps
  const hide = seen?.hide ?? false
  const all = useMemo(() => inboxLines((runs ?? []).filter((r) => !gone.has(r.run_id) && !(hide && r.kind === 'success')), rules, (at) => formatInstant(at, 'datetime')), [runs, gone, hide, rules])
  const lines = all.slice(0, MAX_LINES)
  const newest = lines.flatMap((l) => l.runs).reduce((m, r) => Math.max(m, r.at), 0)
  const visible = useOnScreen(box, lines.length > 0)
  const markSeen = () => {
    setFrozen(true)
    if (newest) void markRoutinesSeen(newest)
  }
  useEffect(() => {
    if (!visible || !newest) return
    const timer = setTimeout(markSeen, SEEN_AFTER_MS)
    return () => clearTimeout(timer)
  }, [visible, newest]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!lines.length) return null
  const open = (l: InboxLine) => navigate({ view: 'rules', id: l.ruleId, run: l.runs[0].run_id })
  const dismiss = (l: InboxLine) => {
    setGone((g) => new Set([...g, ...l.runs.map((r) => r.run_id)]))
    act(Promise.all(l.runs.map((r) => api.dismissRoutineRun(r.rule_id, r.run_id))).then(() => undefined))
  }
  return (
    <div ref={box}>
      <InboxCardView lines={lines} more={all.length - lines.length} hide={hide} online={online}
        onOpen={open} onDismiss={dismiss}
        onSeen={() => { markSeen(); setGone((g) => new Set([...g, ...lines.filter((l) => l.kind === 'success').flatMap((l) => l.runs.map((r) => r.run_id))])) }}
        onHide={(on) => act(setHideSuccesses(on))} onAll={() => navigate({ view: 'rules', tab: 'runs' })} />
    </div>
  )
}
