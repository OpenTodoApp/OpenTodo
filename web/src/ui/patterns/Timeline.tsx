// Timeline (OpenSpec change ui-primitives, design D9): events and comment threads,
// presentational only (task-detail-redesign supplies the data).
import type { ReactNode } from 'react'
import { Avatar } from '../Avatar'
import { Icon, type IconName } from '../Icon'

export type TimelineItem =
  | { kind: 'event'; id: string; icon: IconName; actor: ReactNode; text: ReactNode; time: ReactNode }
  | {
    kind: 'thread'
    id: string
    author: { id: string; name: string }
    time: ReactNode
    body: ReactNode
    actions?: ReactNode
    replies?: Extract<TimelineItem, { kind: 'thread' }>[]
  }

function Thread({ item, nested }: { item: Extract<TimelineItem, { kind: 'thread' }>; nested?: boolean }) {
  return (
    <div className={`flex gap-3 ${nested ? 'pt-3' : ''}`}>
      <Avatar id={item.author.id} name={item.author.name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-body font-semibold text-default">{item.author.name}</span>
          <span className="text-meta text-faint">{item.time}</span>
        </div>
        <div className="user-text mt-0.5 text-body text-default">{item.body}</div>
        {item.actions && <div className="mt-1 flex gap-1">{item.actions}</div>}
        {item.replies && item.replies.length > 0 && (
          <ol className="mt-1 border-l-2 border-default pl-3">
            {item.replies.map((r) => <li key={r.id}><Thread item={r} nested /></li>)}
          </ol>
        )}
      </div>
    </div>
  )
}

export function Timeline({ items, label }: { items: TimelineItem[]; label: string }) {
  return (
    <ol aria-label={label} className="space-y-4">
      {items.map((it) => (
        <li key={it.id}>
          {it.kind === 'thread' ? <Thread item={it} /> : (
            <div className="flex items-start gap-3 text-meta text-muted">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center"><Icon name={it.icon} size="sm" /></span>
              <span className="user-text min-w-0 flex-1 pt-1.5"><span className="font-medium text-default">{it.actor}</span> {it.text}</span>
              <span className="shrink-0 pt-1.5 text-faint">{it.time}</span>
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}
