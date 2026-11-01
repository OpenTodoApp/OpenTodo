// The contrast badge (OpenSpec change theme-editor, design D6, D8): a pair's measured
// ratio, marked as passing or below its minimum, with the minimum in words for
// assistive technology ("3.9 to 1, needs 4.5 to 1"). The mark is an icon and a
// word, never colour alone.
import { Icon } from './Icon'
import { t } from '../lib/i18n'

export interface ContrastBadgeProps {
  ratio: number
  min: number
  /** What the ratio is measured on ("on Canvas"), shown after it. */
  on?: string
  className?: string
}

/** A ratio as people read it: one decimal, truncated, so 4.49 never reads as 4.5. */
export function formatRatio(r: number): string {
  return (Math.floor(r * 10) / 10).toFixed(1)
}

export function ContrastBadge({ ratio, min, on, className = '' }: ContrastBadgeProps) {
  const pass = ratio + 1e-9 >= min
  const spoken = pass
    ? t('{ratio} to 1, passes {min} to 1', { ratio: formatRatio(ratio), min })
    : t('{ratio} to 1, needs {min} to 1', { ratio: formatRatio(ratio), min })
  return (
    <span className={`inline-flex items-center gap-1 text-meta tabular-nums ${pass ? 'text-muted' : 'text-danger'} ${className}`} data-contrast={pass ? 'pass' : 'fail'}>
      <Icon name={pass ? 'circle-check-big' : 'circle-alert'} size="xs" />
      <span aria-hidden="true">{formatRatio(ratio)}:1{on ? ` ${on}` : ''}</span>
      <span className="sr-only">{spoken}{on ? ` ${on}` : ''}</span>
    </span>
  )
}
