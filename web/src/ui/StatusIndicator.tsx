// Status dot (OpenSpec change precision-settings, design-system "Status dot", design
// D4): a small dot in a tone, then the word that states the status, so colour is never
// alone. State (on/off, working/failing, configured) uses it; a category (a role, a
// token scope) keeps a Badge.
import type { ReactNode } from 'react'

export type StatusTone = 'ok' | 'warn' | 'danger' | 'busy' | 'off'

/** The dot's fill per tone; busy pulses unless motion is reduced (index.css covers `data-motion="none"`). */
const DOT: Record<StatusTone, string> = {
  ok: 'bg-success',
  warn: 'bg-warning',
  danger: 'bg-danger',
  busy: 'bg-info animate-pulse motion-reduce:animate-none',
  off: 'bg-faint',
}

export interface StatusIndicatorProps {
  tone: StatusTone
  /** The word (or short phrase) that states the status; it is what assistive technology reads. */
  children: ReactNode
  className?: string
}

export function StatusIndicator({ tone, children, className }: StatusIndicatorProps) {
  return (
    <span data-status={tone} className={`inline-flex max-w-full items-center gap-1.5 text-meta text-muted${className ? ` ${className}` : ''}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[tone]}`} />
      <span className="truncate">{children}</span>
    </span>
  )
}

/** The status tone for a Badge hue of the earlier settings (precision-settings D5). */
export function toneForHue(hue: 'green' | 'orange' | 'red' | 'blue' | 'slate' | string | undefined): StatusTone {
  if (hue === 'green') return 'ok'
  if (hue === 'orange' || hue === 'amber' || hue === 'yellow') return 'warn'
  if (hue === 'red') return 'danger'
  if (hue === 'blue' || hue === 'indigo' || hue === 'cyan') return 'busy'
  return 'off'
}
