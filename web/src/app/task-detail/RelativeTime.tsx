// Relative time with the absolute time in the user's format on hover and focus
// (OpenSpec task-detail-redesign: comments, activity and history).
import { useDateTimeFormat } from '../DateTimePrefsProvider'

/** "just now", "5 min ago", "2 h ago", "3 d ago", else the date in the user's format. */
export function relativeLabel(ts: number, now: number, date: (ms: number) => string): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d} d ago`
  return date(ts)
}

/** Focusable so keyboard users get the absolute time too: it is the element's text for screen readers and shown while focused. */
export function RelativeTime({ ts, now = Date.now(), className = '' }: { ts: number; now?: number; className?: string }) {
  const dt = useDateTimeFormat()
  const abs = dt.formatInstant(ts, 'datetime')
  const rel = relativeLabel(ts, now, (ms) => dt.formatInstant(ms, 'date'))
  return (
    <time dateTime={new Date(ts).toISOString()} title={abs} tabIndex={0}
      className={`group/time rounded-sm text-faint focus-visible:outline-2 focus-visible:outline-focus ${className}`}>
      <span className="group-focus/time:hidden" aria-hidden="true">{rel}</span>
      {/* The absolute time is the text assistive technology reads, and is shown while focused. */}
      <span className="sr-only group-focus/time:not-sr-only">{abs}</span>
    </time>
  )
}
