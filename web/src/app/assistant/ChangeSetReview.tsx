import { useId, type KeyboardEvent, type RefObject } from 'react'
import { Kbd } from '../shortcuts/Kbd'
import type { Review } from '../../lib/assistant'
import { t } from '../../lib/i18n'
import { Icon } from '../../ui'

export interface ReviewResult {
  applied: number
  total: number
  undoId: string | null
  /** After Undo: what came back and what was skipped. */
  undone?: { restored: number; skipped: string[] }
  discarded?: boolean
  auto?: boolean
}

export interface ChangeSetReviewProps {
  review: Review | null
  result: ReviewResult | null
  busy: boolean
  onToggle: (index: number, checked: boolean) => void
  onApply: () => void
  onDiscard: () => void
  onUndo: () => void
  regionRef?: RefObject<HTMLDivElement | null>
}

/** "4 of 5 changes applied." */
export function appliedSummary(r: ReviewResult): string {
  if (r.discarded) return t('Proposal discarded. Nothing was changed.')
  if (r.undone) {
    const base = t('Undone: {n} restored.', { n: r.undone.restored })
    return r.undone.skipped.length ? `${base} ${t('Kept because they were changed again since: {items}.', { items: r.undone.skipped.join(', ') })}` : base
  }
  if (r.applied === r.total) {
    return r.auto ? t('{n, plural, one {# change applied automatically.} other {# changes applied automatically.}}', { n: r.applied }) : t('{n, plural, one {# change applied.} other {# changes applied.}}', { n: r.applied })
  }
  return r.auto ? t('{n} of {total} changes applied automatically.', { n: r.applied, total: r.total }) : t('{n} of {total} changes applied.', { n: r.applied, total: r.total })
}

/**
 * The proposed change set (in-app-assistant D2, assistant-surface D4): a card with
 * a head (what it is, how many are selected, that nothing changes yet), one row per
 * item (checkbox, the task, each change in words at the right; shared and stale
 * items marked) and a foot (Apply the selected, Discard, the keys). Enter applies
 * the checked items, Esc discards.
 */
export function ChangeSetReview(p: ChangeSetReviewProps) {
  const headingId = useId()
  if (p.result) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-default bg-surface px-3 py-2 text-body" data-assistant-result>
        <Icon name={p.result.discarded ? 'x' : 'check'} size="sm" className="text-muted" />
        <p role="status" className="min-w-0 flex-1">{appliedSummary(p.result)}</p>
        {p.result.undoId && !p.result.undone && !p.result.discarded && (
          <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={p.onUndo} aria-busy={p.busy}>{t('Undo')}</button>
        )}
      </div>
    )
  }
  const review = p.review
  if (!review) return null
  const checked = review.items.filter((i) => i.checked).length
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName !== 'BUTTON') {
      e.preventDefault()
      if (!p.busy && checked > 0) p.onApply()
    }
  }
  return (
    <div ref={p.regionRef} role="group" aria-labelledby={headingId} onKeyDown={onKeyDown} data-assistant-review
      className="@container/review overflow-hidden rounded-card border border-default bg-surface">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-default px-3 py-2">
        <Icon name="pencil" size="sm" className="text-muted" />
        <h3 id={headingId} className="text-body font-semibold">{t('Proposed changes')}</h3>
        <span className="text-meta text-muted" data-assistant-selected>{t('{checked} of {count} selected', { checked, count: review.items.length })}</span>
        <span className="ml-auto text-meta text-faint">{t('Nothing changes until you apply')}</span>
      </div>
      {review.dropped.map((d) => <p key={d} className="border-b border-default px-3 py-1.5 text-meta text-muted">{d}</p>)}
      <ul className="divide-y divide-(--ot-border-default)" aria-label={t('Proposed changes')}>
        {review.items.map((item, i) => {
          const label = `${item.title}${item.lines.length ? ': ' + item.lines.join('; ') : ''}`
          return (
            <li key={item.change.entity + item.change.entityId}>
              <label className="flex flex-col gap-x-3 gap-y-0.5 px-3 py-2 text-body hover:bg-hover @md/review:flex-row @md/review:items-start">
                <span className="flex min-w-0 flex-1 items-start gap-2">
                  <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={item.checked} onChange={(e) => p.onToggle(i, e.target.checked)}
                    aria-label={label + (item.state === 'stale' ? ` ${t('(changed since proposed)')}` : '') + (item.shared ? ` ${t('(shared project)')}` : '')} />
                  <span className="min-w-0 flex-1 user-text">
                    <span className={item.checked ? 'text-default' : 'text-muted'}>{item.title}</span>
                    {item.shared && <span className="ml-1.5 rounded-control border border-info px-1 text-hint font-medium text-on-info-soft">{t('shared')}</span>}
                    {item.state === 'stale' && <span className="ml-1.5 rounded-control border border-warning px-1 text-hint font-medium text-on-warning-soft">{t('changed since proposed')}</span>}
                  </span>
                </span>
                {item.lines.length > 0 && (
                  <span className="pl-6 text-meta text-muted user-text @md/review:max-w-[55%] @md/review:pl-0 @md/review:text-right">
                    {item.lines.map((l) => <span key={l} className="block">{l}</span>)}
                  </span>
                )}
              </label>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2 border-t border-default px-3 py-2">
        <button type="button" className="ui-btn ui-btn--primary ui-btn--sm gap-1" onClick={p.onApply} disabled={checked === 0} aria-busy={p.busy} data-assistant-apply>
          <Icon name="check" size="sm" />
          {t('{n, plural, one {Apply # change} other {Apply # changes}}', { n: checked })}
        </button>
        <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={p.onDiscard}>{t('Discard')}</button>
        <span className="ml-auto text-meta text-faint">{t.rich('{enter} applies, {esc} discards. Each change shows in its task’s history.', { enter: <Kbd k="Enter" />, esc: <Kbd k="Esc" /> })}</span>
      </div>
    </div>
  )
}
