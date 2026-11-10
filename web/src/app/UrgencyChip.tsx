// The urgency score chip and its breakdown (OpenSpec change urgency-sort, design D4),
// loaded with the first row of a list ordered by urgency. The chip shows the score
// with one decimal; hovering it shows the breakdown in one line, Enter or Space
// opens it as a popover. The touch row menu's "Why here?" shows the same breakdown.
import { useRef, useState } from 'react'
import { Popover, Tooltip } from '../ui'
import { currentLocale, t } from '../lib/i18n'
import type { Urgency, UrgencyPart } from '../lib/urgency'

function partLabel({ key, n }: UrgencyPart): string {
  switch (key) {
    case 'due': return n === 0 ? t('Due today') : n > 0 ? t('Due in {n} d', { n }) : t('Due {n} d ago', { n: -n })
    case 'deadline': return n === 0 ? t('Deadline today') : n > 0 ? t('Deadline in {n} d', { n }) : t('Deadline passed')
    case 'priority': return t('Priority {p}', { p: n })
    case 'blocks': return t('Blocks {n, plural, one {# task} other {# tasks}}', { n })
    case 'age': return t('Age {n} d', { n })
    case 'timer': return t('Timer running')
    case 'blocked': return t('Blocked')
    case 'deferred': return t('Starts in {n} d', { n })
    case 'someday': return t('Someday')
  }
}

const fixed = (digits: number, sign: boolean) => new Intl.NumberFormat(currentLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay: sign ? 'exceptZero' : 'auto' })

/** The breakdown in one line: "Due today +8.80 · Priority 1 +6.00 = 14.80". */
export function breakdownText(u: Urgency): string {
  const signed = fixed(2, true)
  const parts = u.parts.map((p) => `${partLabel(p)} ${signed.format(p.value)}`)
  return `${parts.join(' · ')}${parts.length ? ' ' : ''}= ${fixed(2, false).format(u.score)}`
}

/** The breakdown as a list, one component per line, then the total. */
export function UrgencyBreakdown({ urgency: u }: { urgency: Urgency }) {
  const signed = fixed(2, true)
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-meta tabular-nums" data-urgency-breakdown>
      {u.parts.map((p) => (
        <div key={p.key} className="contents">
          <dt className="text-muted">{partLabel(p)}</dt>
          <dd className="text-right text-default">{signed.format(p.value)}</dd>
        </div>
      ))}
      <dt className="border-t border-soft pt-1 font-medium text-default">{t('Urgency')}</dt>
      <dd className="border-t border-soft pt-1 text-right font-medium text-default">{fixed(2, false).format(u.score)}</dd>
    </dl>
  )
}

/** The row's score: a quiet number, a button that explains it. */
export default function UrgencyChipBody({ urgency: u }: { urgency: Urgency }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const score = fixed(1, false).format(u.score)
  return (
    <>
      <Tooltip label={breakdownText(u)} disabled={open}>
        <button ref={anchor} type="button" data-urgency-chip aria-label={t('Urgency {score}, show why', { score })} aria-expanded={open}
          className="shrink-0 rounded-chip px-0.5 text-meta tabular-nums text-faint hover:text-muted focus-visible:text-muted"
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}>
          {score}
        </button>
      </Tooltip>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} label={t('Why here?')} width="sm:w-64" className="p-3">
        <UrgencyBreakdown urgency={u} />
      </Popover>
    </>
  )
}
