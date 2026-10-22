// The running indicator (OpenSpec change time-tracking, "Running indicator", design
// D6): while the user's entry runs, the sidebar footer's row shows a pill with the
// elapsed time and the task's title and a Stop control in place of the account name
// (sidebar-v2 D6), and below 768 px the bar shows the time as a pill
// that opens a sheet with the title, Open and Stop. One live read of the running
// entry and one minute timer; the ticking text is hidden from assistive technology,
// which hears one announcement when tracking starts and one when it stops.
import { useEffect, useRef, useState } from 'react'
import { Button, DESKTOP_HEADER_QUERY, Dialog, Icon, IconButton, Menu, MenuItem, Tooltip, useMediaQuery } from '../ui'
import { useTask } from '../lib/localData'
import { keysOf } from '../lib/shortcuts'
import { elapsedText, minutesOf, spokenMinutes } from '../lib/time'
import { stopTracking, useMinuteNow, useRunningEntry } from '../lib/timeEntries'
import type { TimeEntry } from '../lib/types'
import { t } from '../lib/i18n'
import { act } from './actionError'
import { openTaskPanel } from './panel'

/** After this many minutes the elapsed time takes the caution tone (a forgotten entry). */
export const LONG_RUNNING_MINUTES = 12 * 60

export type Running = { entry: TimeEntry; title: string; minutes: number }

/** The running entry with its task's title and elapsed minutes, ticking on the minute. */
export function useRunning(): Running | null {
  const entry = useRunningEntry()
  const task = useTask(entry?.task_id)
  const now = useMinuteNow(!!entry)
  // Wait for the task row, so the first thing shown and announced is its title.
  if (!entry || task === undefined) return null
  return { entry, title: task?.title || t('Untitled'), minutes: minutesOf(entry, now) }
}

/** One polite announcement when tracking starts and when it stops, never per tick. */
function Announcer({ id, title }: { id: string | null; title: string }) {
  const [text, setText] = useState('')
  const last = useRef<string | null>(id)
  useEffect(() => {
    if (id === last.current) return
    setText(id ? t('Tracking time on {title}', { title }) : t('Tracking stopped'))
    last.current = id
  }, [id, title])
  return <span className="sr-only" role="status" aria-live="polite" data-tracking-announcer>{text}</span>
}

/**
 * The accessible name holds the visible text (WCAG "Label in Name"): "Tracking 1:05 ·
 * Write the report". It is not a live region, so the ticks are never announced.
 */
const nameOf = (title: string, minutes: number) => t('Tracking {text}', { text: `${elapsedText(minutes)} · ${title}` })

/** The footer's announcements (from 768 px); below it the phone bar's pill announces and the drawer's copy stays quiet. */
export function TrackingAnnouncer({ running }: { running: Running | null }) {
  const desktop = useMediaQuery(DESKTOP_HEADER_QUERY)
  return desktop ? <Announcer id={running?.entry.id ?? null} title={running?.title ?? ''} /> : null
}

/**
 * The footer's pill (sidebar-v2 D6): one group of two controls in the row, the body
 * opening the task and Stop inside it. The icon rail shows the time alone, with the
 * title in its tooltip and Open and Stop in a menu.
 */
export function RunningPill({ running: r, collapsed = false }: { running: Running; collapsed?: boolean }) {
  const long = r.minutes >= LONG_RUNNING_MINUTES ? 'text-warning' : 'text-strong'
  const stop = () => act(stopTracking())
  if (collapsed) {
    return (
      <div data-tracking-indicator className="w-full">
        <Menu kind="menu" label={nameOf(r.title, r.minutes)} title={r.title} tip={`${elapsedText(r.minutes)} · ${r.title}`} tipSide="right" align="start" width="sm:w-56"
          triggerProps={{ 'data-tracking-open': true }}
          triggerClassName={`flex min-h-8 w-full items-center justify-center rounded-full bg-accent-soft px-1 text-hint font-semibold tabular-nums max-md:min-h-11 ${long}`}
          trigger={<span aria-hidden="true" data-tracking-text>{elapsedText(r.minutes)}</span>}>
          <MenuItem label={t('Open the tracked task')} icon="external-link" onSelect={() => openTaskPanel(r.entry.task_id)} />
          <MenuItem label={t('Stop')} icon="square" shortcut={keysOf('list.track')} onSelect={stop} data-tracking-stop />
        </Menu>
      </div>
    )
  }
  return (
    <div role="group" aria-label={t('Tracking time')} data-tracking-indicator className="flex min-w-0 flex-1 items-center rounded-full bg-accent-soft">
      <Tooltip label={t('Open the tracked task')} side="top">
        <button type="button" aria-label={nameOf(r.title, r.minutes)} onClick={() => openTaskPanel(r.entry.task_id)} data-tracking-open
          className="flex min-h-8 min-w-0 flex-1 items-center rounded-full py-1 pl-2.5 text-left text-meta max-md:min-h-11">
          <span aria-hidden="true" className="min-w-0 truncate text-on-accent-soft" data-tracking-text>
            <span className={`font-semibold tabular-nums ${long}`}>{elapsedText(r.minutes)}</span>{' · '}{r.title}
          </span>
        </button>
      </Tooltip>
      <IconButton icon="square" label={t('Stop')} shortcut={keysOf('list.track')} size="sm" className="shrink-0 rounded-full text-on-accent-soft max-md:min-h-11 max-md:min-w-11" onClick={stop} data-tracking-stop />
    </div>
  )
}

/** The announcer and the pill together, for a footer that does not need the running entry itself. */
export function TrackingIndicator({ collapsed = false }: { collapsed?: boolean }) {
  const r = useRunning()
  return <><TrackingAnnouncer running={r} />{r && <RunningPill running={r} collapsed={collapsed} />}</>
}

/** The phone bar's pill (below 768 px): the elapsed time, opening a sheet with the title, Open and Stop. */
export function TrackingPill() {
  const r = useRunning()
  const [open, setOpen] = useState(false)
  useEffect(() => { if (!r) setOpen(false) }, [r])
  return (
    <>
      <Announcer id={r?.entry.id ?? null} title={r?.title ?? ''} />
      {r && (
        <button type="button" aria-label={nameOf(r.title, r.minutes)} aria-haspopup="dialog" onClick={() => setOpen(true)} data-tracking-pill
          className="touch-target inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2.5 text-meta font-medium tabular-nums text-on-accent-soft">
          <Icon name="timer" size="xs" />
          <span aria-hidden="true">{elapsedText(r.minutes)}</span>
        </button>
      )}
      {r && open && (
        <Dialog title={t('Tracking time')} placement="sheet" onClose={() => setOpen(false)} testId="tracking-sheet">
          <p className="user-text mb-1 text-body font-medium">{r.title}</p>
          <p className="mb-4 text-meta tabular-nums text-muted">{spokenMinutes(r.minutes)}</p>
          <div className="flex gap-2">
            <Button variant="secondary" icon="external-link" onClick={() => { setOpen(false); openTaskPanel(r.entry.task_id) }}>{t('Open')}</Button>
            <Button variant="primary" icon="square" onClick={() => { setOpen(false); act(stopTracking()) }}>{t('Stop tracking')}</Button>
          </div>
        </Dialog>
      )}
    </>
  )
}
