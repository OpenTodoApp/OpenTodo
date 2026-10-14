// EmptyState (OpenSpec change ui-primitives, design D9).
import type { ReactNode } from 'react'
import { Icon, type IconName } from '../Icon'

export interface EmptyStateProps {
  icon?: IconName
  title: ReactNode
  body?: ReactNode
  action?: ReactNode
}

export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      {icon && <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-sunken text-muted"><Icon name={icon} size="md" /></span>}
      <p className="text-body font-medium text-default">{title}</p>
      {body && <p className="max-w-sm text-meta text-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
