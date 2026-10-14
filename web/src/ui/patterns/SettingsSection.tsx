// Settings section and row (OpenSpec change ui-primitives, design D9).
import { useId, type ReactNode } from 'react'
import { HelpLink } from '../../app/help/HelpLink'

export interface SettingsSectionProps {
  title: string
  description?: ReactNode
  /** Help screen id (docs front matter `screens`); shows a Help link beside the title. */
  helpId?: string
  /** Heading level: h2 under the section page's single h1 (default), h3 when nested. */
  level?: 2 | 3
  actions?: ReactNode
  id?: string
  children: ReactNode
}

export function SettingsSection({ title, description, helpId, level = 2, actions, id, children }: SettingsSectionProps) {
  const headingId = useId()
  const H = level === 2 ? 'h2' : 'h3'
  return (
    <section id={id} aria-labelledby={headingId} className="rounded-card border border-default bg-surface p-4 shadow-1 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <H id={headingId} className="text-h3 font-semibold text-default">{title}</H>
          {description && <p className="mt-1 text-meta text-muted">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {helpId && <HelpLink screen={helpId} topic={title} />}
        </div>
      </div>
      <div className="mt-4 divide-y divide-(--ot-border)">{children}</div>
    </section>
  )
}

export interface SettingRowProps {
  label: ReactNode
  description?: ReactNode
  /** The current state, shown before the control that changes it. */
  status?: ReactNode
  control?: ReactNode
  /** id of the control, so the label names it. */
  htmlFor?: string
}

export function SettingRow({ label, description, status, control, htmlFor }: SettingRowProps) {
  const Label = htmlFor ? 'label' : 'div'
  return (
    <div className="grid gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
      <div className="min-w-0">
        <Label {...(htmlFor ? { htmlFor } : {})} className="block text-sm font-medium text-default">{label}</Label>
        {description && <p className="mt-0.5 text-meta text-muted">{description}</p>}
        {status && <div className="mt-1 text-meta text-default">{status}</div>}
      </div>
      {control && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{control}</div>}
    </div>
  )
}
