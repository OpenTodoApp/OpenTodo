// The metadata language of rows and cards (OpenSpec change ux-overhaul,
// task-list-presentation "Metadata language", design D7): three styles only.
// `ToneText` for a date or a deadline (a tone, an optional icon, the text),
// `LabelChip` for a label (its colour dot and name) and `NeutralChip` for a count
// or a name (estimate, subtask progress, comments, attachments, project), in the
// metadata size with tabular figures, never a monospace face. Icons in chips are
// 12 px ("Secondary text is one size").
import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { t } from '../lib/i18n'

export type Tone = 'danger' | 'success' | 'warning' | 'accent' | 'violet' | 'indigo' | 'muted' | 'faint'

const TONE: Record<Tone, string> = {
  danger: 'text-danger',
  success: 'text-success',
  warning: 'text-warning',
  accent: 'text-accent',
  violet: 'text-(--ot-hue-violet-text)',
  indigo: 'text-(--ot-hue-indigo-text)',
  muted: 'text-muted',
  faint: 'text-faint',
}

export interface ToneTextProps {
  tone?: Tone
  /** 12 px, before the text (the deadline's hourglass). */
  icon?: IconName
  children: ReactNode
  /** The full phrase for assistive technology when the text is abbreviated. */
  label?: string
  className?: string
  'data-testid'?: string
}

/** A short phrase in a tone colour: the date ("Today · evening · repeats") or the deadline. */
export function ToneText({ tone = 'muted', icon, children, label, className, ...rest }: ToneTextProps & Record<`data-${string}`, string | undefined>) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 text-meta tabular-nums ${TONE[tone]}${className ? ` ${className}` : ''}`} aria-label={label} {...rest}>
      {icon && <Icon name={icon} size="xs" />}
      <span className="truncate">{children}</span>
    </span>
  )
}

export interface NeutralChipProps {
  icon?: IconName
  children?: ReactNode
  /** The full phrase for assistive technology ("3 comments"). */
  label?: string
  /** A colour dot before the text (the project). */
  dot?: string | null
  className?: string
}

/** A quiet chip for a count or a name: sunken fill, metadata size, tabular figures. */
export function NeutralChip({ icon, children, label, dot, className, ...rest }: NeutralChipProps & Record<`data-${string}`, string | undefined>) {
  return (
    <span className={`inline-flex max-w-full min-w-0 items-center gap-1 rounded-chip bg-sunken px-1.5 py-px text-meta tabular-nums text-muted dark:bg-raised${className ? ` ${className}` : ''}`} aria-label={label} {...rest}>
      {dot && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} />}
      {icon && <Icon name={icon} size="xs" />}
      {children !== undefined && children !== null && <span className="truncate">{children}</span>}
    </span>
  )
}

export interface LabelChipProps {
  name: string
  color: string
  /** With a handler, a remove control follows the name (the label picker's chips). */
  onRemove?: () => void
  className?: string
}

/** A label: its colour dot and name in an outlined chip; not a button unless it can be removed. */
export function LabelChip({ name, color, onRemove, className }: LabelChipProps) {
  return (
    <span className={`inline-flex max-w-full min-w-0 items-center gap-1 rounded-chip border border-default px-1.5 py-px text-meta text-muted${className ? ` ${className}` : ''}`} data-label-chip>
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="truncate">{name}</span>
      {onRemove && (
        <button type="button" aria-label={t('Remove label {name}', { name })} onClick={onRemove} className="ml-0.5 leading-none text-faint hover:text-danger"><Icon name="x" size={10} /></button>
      )}
    </span>
  )
}
