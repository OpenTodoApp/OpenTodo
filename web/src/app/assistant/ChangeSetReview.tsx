import { useId, type KeyboardEvent, type RefObject } from 'react'
import { Kbd } from '../shortcuts/Kbd'
import type { Review } from '../../lib/assistant'
import { t } from '../../lib/i18n'

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
 * The proposed change set (in-app-assistant D2): items grouped by entity with
 * each change in words, checked by default, shared items badged, stale items
 * unchecked and marked. Enter applies the checked items, Esc discards.
 */
export function ChangeSetReview(p: ChangeSetReviewProps) {
  const headingId = useId()
  if (p.result) {
    return (
      <div className="rounded-control border border-default p-3 text-body" data-assistant-result>
        <p role="status">{appliedSummary(p.result)}</p>
        {p.result.undoId && !p.result.undone && !p.result.discarded && (
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--md mt-2 border border-input" onClick={p.onUndo} aria-busy={p.busy}>{t('Undo')}</button>
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
      className="space-y-2 rounded-control border border-accent/40 bg-accent-soft p-3">
      <h3 id={headingId} className="text-body font-semibold">
        {t('Proposed changes ({count})', { count: review.items.length })}
      </h3>
      <p className="text-meta text-muted">{t.rich('Nothing changes until you apply: apply the checked items with {enter}, discard with {esc}.', { enter: <Kbd k="Enter" />, esc: <Kbd k="Esc" /> })}</p>
      {review.dropped.map((d) => <p key={d} className="text-meta text-muted">{d}</p>)}
      <ul className="space-y-1" aria-label={t('Proposed changes')}>
        {review.items.map((item, i) => {
          const label = `${item.title}${item.lines.length ? ': ' + item.lines.join('; ') : ''}`
          return (
            <li key={item.change.entity + item.change.entityId}>
              <label className="flex items-start gap-2 rounded-control p-1.5 text-body hover:bg-surface/60 dark:hover:bg-raised">
                <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={item.checked} onChange={(e) => p.onToggle(i, e.target.checked)}
                  aria-label={label + (item.state === 'stale' ? ` ${t('(changed since proposed)')}` : '') + (item.shared ? ` ${t('(shared project)')}` : '')} />
                <span className="min-w-0 flex-1 user-text">
                  <span className="font-medium">{item.title}</span>
                  {item.shared && <span className="ml-1.5 rounded-control border border-info px-1 text-hint font-medium text-on-info-soft">{t('shared')}</span>}
                  {item.state === 'stale' && <span className="ml-1.5 rounded-control border border-warning px-1 text-hint font-medium text-on-warning-soft">{t('changed since proposed')}</span>}
                  {item.lines.map((l) => <span key={l} className="block text-muted">{l}</span>)}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" className="ui-btn ui-btn--primary ui-btn--md" onClick={p.onApply} disabled={checked === 0} aria-busy={p.busy} data-assistant-apply>
          {t('Apply')}{' '}{checked === review.items.length ? t('all') : t('{checked} of {count}', { checked, count: review.items.length })}
        </button>
        <button type="button" className="ui-btn ui-btn--secondary ui-btn--md" onClick={p.onDiscard}>{t('Discard')}</button>
      </div>
    </div>
  )
}
