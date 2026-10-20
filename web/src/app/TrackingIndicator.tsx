// The running indicator (OpenSpec change time-tracking, "Running indicator", design
// D6): while the user's entry runs, the sidebar footer shows the elapsed time and the
// task's title with a Stop control, and below 768 px the bar shows the time as a pill
// that opens a sheet with the title, Open and Stop. One live read of the running
// entry and one minute timer; the ticking text is hidden from assistive technology,
// which hears one announcement when tracking starts and one when it stops.
import { useEffect, useRef, useState } from 'react'
import { Button, DESKTOP_HEADER_QUERY, Dialog, Icon, IconButton, Tooltip, useMediaQuery } from '../ui'
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

/** The running entry with its task's title and elapsed minutes, ticking on the minute. */
function useRunning(): { entry: TimeEntry; title: string; minutes: number } | null {
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

/** The sidebar footer's indicator (from 768 px); the collapsed rail shows the time only. */
export function TrackingIndicator({ collapsed = false }: { collapsed?: boolean }) {
  const r = useRunning()
  // Below 768 px the phone bar's pill announces; the drawer's copy stays quiet.
  const desktop = useMediaQuery(DESKTOP_HEADER_QUERY)
  return (
    <>
      {desktop && <Announcer id={r?.entry.id ?? null} title={r?.title ?? ''} />}
      {r && (
        <div className={`mb-1 flex items-center gap-1 ${collapsed ? 'flex-col' : ''}`} data-tracking-indicator>
          <Tooltip label={collapsed ? `${elapsedText(r.minutes)} · ${r.title}` : t('Open the tracked task')} side={collapsed ? 'right' : 'top'}>
            <button type="button" aria-label={nameOf(r.title, r.minutes)} onClick={() => openTaskPanel(r.entry.task_id)} data-tracking-open
              className={`flex min-h-9 min-w-0 items-center gap-2 rounded-control py-1 text-left text-body text-muted hover:bg-sunken hover:text-default dark:hover:bg-raised max-md:min-h-11 ${collapsed ? 'w-full justify-center px-0' : 'flex-1 px-2'}`}>
              <Icon name="timer" className="shrink-0 text-accent" />
              <span aria-hidden="true" className={`min-w-0 truncate tabular-nums ${r.minutes >= LONG_RUNNING_MINUTES ? 'text-on-warning-soft' : ''}`} data-tracking-text>
                {collapsed ? elapsedText(r.minutes) : `${elapsedText(r.minutes)} · ${r.title}`}
              </span>
            </button>
          </Tooltip>
          <IconButton icon="square" label={t('Stop tracking')} shortcut={keysOf('list.track')} size="sm" onClick={() => act(stopTracking())} data-tracking-stop />
        </div>
      )}
    </>
  )
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
