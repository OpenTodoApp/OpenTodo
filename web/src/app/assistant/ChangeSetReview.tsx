import { useId, type KeyboardEvent, type RefObject } from 'react'
import { Kbd } from '../shortcuts/Kbd'
import type { Review } from '../../lib/assistant'

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
  if (r.discarded) return 'Proposal discarded. Nothing was changed.'
  if (r.undone) {
    const base = `Undone: ${r.undone.restored} restored.`
    return r.undone.skipped.length ? `${base} Kept because they were changed again since: ${r.undone.skipped.join(', ')}.` : base
  }
  const what = r.applied === r.total ? `${r.applied} change${r.applied === 1 ? '' : 's'} applied` : `${r.applied} of ${r.total} changes applied`
  return `${what}${r.auto ? ' automatically' : ''}.`
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
      <div className="rounded-lg border border-default p-3 text-sm" data-assistant-result>
        <p role="status">{appliedSummary(p.result)}</p>
        {p.result.undoId && !p.result.undone && !p.result.discarded && (
          <button type="button" className="btn-ghost mt-2 border border-input" onClick={p.onUndo} aria-busy={p.busy}>Undo</button>
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
      className="space-y-2 rounded-lg border border-accent/40 bg-accent-soft p-3">
      <h3 id={headingId} className="text-sm font-semibold">
        Proposed changes ({review.items.length})
      </h3>
      <p className="text-xs text-muted">Nothing changes until you apply: apply the checked items with <Kbd k="Enter" />, discard with <Kbd k="Esc" />.</p>
      {review.dropped.map((d) => <p key={d} className="text-xs text-muted">{d}</p>)}
      <ul className="space-y-1" aria-label="Proposed changes">
        {review.items.map((item, i) => {
          const label = `${item.title}${item.lines.length ? ': ' + item.lines.join('; ') : ''}`
          return (
            <li key={item.change.entity + item.change.entityId}>
              <label className="flex items-start gap-2 rounded-md p-1.5 text-sm hover:bg-surface/60 dark:hover:bg-raised">
                <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={item.checked} onChange={(e) => p.onToggle(i, e.target.checked)}
                  aria-label={label + (item.state === 'stale' ? ' (changed since proposed)' : '') + (item.shared ? ' (shared project)' : '')} />
                <span className="min-w-0 flex-1 user-text">
                  <span className="font-medium">{item.title}</span>
                  {item.shared && <span className="ml-1.5 rounded border border-info px-1 text-[11px] font-medium text-on-info-soft">shared</span>}
                  {item.state === 'stale' && <span className="ml-1.5 rounded border border-warning px-1 text-[11px] font-medium text-on-warning-soft">changed since proposed</span>}
                  {item.lines.map((l) => <span key={l} className="block text-muted">{l}</span>)}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" className="btn-primary" onClick={p.onApply} disabled={checked === 0} aria-busy={p.busy} data-assistant-apply>
          Apply {checked === review.items.length ? 'all' : `${checked} of ${review.items.length}`}
        </button>
        <button type="button" className="btn-secondary" onClick={p.onDiscard}>Discard</button>
      </div>
    </div>
  )
}
