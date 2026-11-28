// Moves and assignments are reviewed first (bulk-edit D6): a move can change who
// sees a task, an assignment tells someone. The assistant's review renders the
// changes; Enter applies the checked ones as one undoable batch, Escape discards.
// The review arrives after the dialog opened, so focus moves into it then (#1236).
import { Dialog, focusArrived } from '../../ui'
import { useEffect, useRef, useState } from 'react'
import { reviewChangeSet, type Review } from '../../lib/assistant'
import type { ReviewPlan } from '../../lib/bulk'
import { applyBatch } from '../../lib/undo'
import { ChangeSetReview } from '../assistant/ChangeSetReview'
import { showBulkToast } from './toastStore'
import { t } from '../../lib/i18n'

export function BulkReview({ title, plan, onClose, onApplied }: { title: string; plan: ReviewPlan; onClose: () => void; onApplied?: () => void }) {
  const [review, setReview] = useState<Review | null>(null)
  const [busy, setBusy] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  const ready = review !== null
  useEffect(() => { void reviewChangeSet(plan.items).then(setReview) }, [plan])
  useEffect(() => { if (ready) focusArrived(body.current) }, [ready])
  const apply = async () => {
    if (!review) return
    setBusy(true)
    const checked = review.items.filter((i) => i.checked).map((i) => i.change.entityId)
    const total = review.items.length
    const applied = checked.length === total ? t('{n, plural, one {# change applied} other {# changes applied}}', { n: total }) : t('{n} of {total} changes applied', { n: checked.length, total })
    // A move to the Inbox leaves repeating tasks scheduled, and says so (inbox-drop-unplaces D2).
    const repeating = plan.repeating?.(checked).length ?? 0
    const label = repeating ? t('{changes}; {r, plural, one {# repeating task stays scheduled} other {# repeating tasks stay scheduled}}', { changes: applied, r: repeating }) : applied
    const entry = await applyBatch(await plan.resolve(checked), { source: 'bulk', label })
    showBulkToast(label, entry?.id ?? null)
    onApplied?.()
    onClose()
  }
  return (
    <Dialog title={title} onClose={onClose} size="md" testId="bulk-review">
      <div ref={body} data-bulk-review>
        {review ? (
          <ChangeSetReview review={review} result={null} busy={busy}
            onToggle={(i, checked) => setReview({ ...review, items: review.items.map((it, j) => (j === i ? { ...it, checked } : it)) })}
            onApply={() => void apply()} onDiscard={onClose} onUndo={() => {}} />
        ) : <p className="text-body text-muted" role="status">{t('Preparing the changes…')}</p>}
      </div>
    </Dialog>
  )
}
