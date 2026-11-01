// Notice (OpenSpec change settings-redesign): one line of status inside a card,
// such as offline, a success message or an error. Errors are alerts; the rest are status.
// An action sits beside the text while the text keeps a readable measure (16rem) and
// moves under it when the card is narrower, its buttons wrapping in turn, so a long
// sentence is never squeezed to a word a line by its buttons (issue 731).
import type { ReactNode } from 'react'
import { Icon, type IconName } from '../Icon'

const TONE: Record<NoticeTone, { icon: IconName; className: string }> = {
  info: { icon: 'circle-help', className: 'bg-sunken text-default dark:bg-raised' },
  success: { icon: 'check', className: 'bg-success-soft text-on-success-soft' },
  warning: { icon: 'alarm-clock', className: 'bg-warning-soft text-on-warning-soft' },
  danger: { icon: 'x', className: 'bg-danger-soft text-on-danger-soft' },
}
export type NoticeTone = 'info' | 'success' | 'warning' | 'danger'

export function Notice({ tone = 'info', children, action }: { tone?: NoticeTone; children: ReactNode; action?: ReactNode }) {
  const t = TONE[tone]
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-control px-3 py-2 text-meta ${t.className}`}>
      <span className="mt-0.5 shrink-0"><Icon name={t.icon} /></span>
      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-2" data-notice-body>
        <div className="min-w-0 grow basis-64">{children}</div>
        {action && <div className="max-w-full min-w-0" data-notice-action>{action}</div>}
      </div>
    </div>
  )
}
