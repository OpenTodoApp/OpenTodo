// Moves and assignments are reviewed first (bulk-edit D6): a move can change who
// sees a task, an assignment tells someone. The assistant's review renders the
// changes; Enter applies the checked ones as one undoable batch, Escape discards.
import { Dialog } from '../../ui'
import { useEffect, useState } from 'react'
import { reviewChangeSet, type Review } from '../../lib/assistant'
import type { ReviewPlan } from '../../lib/bulk'
import { applyBatch } from '../../lib/undo'
import { ChangeSetReview } from '../assistant/ChangeSetReview'
import { showBulkToast } from './toastStore'
import { t } from '../../lib/i18n'

export function BulkReview({ title, plan, onClose, onApplied }: { title: string; plan: ReviewPlan; onClose: () => void; onApplied?: () => void }) {
  const [review, setReview] = useState<Review | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { void reviewChangeSet(plan.items).then(setReview) }, [plan])
  const apply = async () => {
    if (!review) return
    setBusy(true)
    const checked = review.items.filter((i) => i.checked).map((i) => i.change.entityId)
    const total = review.items.length
    const label = checked.length === total ? t('{n, plural, one {# change applied} other {# changes applied}}', { n: total }) : t('{n} of {total} changes applied', { n: checked.length, total })
    const entry = await applyBatch(await plan.resolve(checked), { source: 'bulk', label })
    showBulkToast(label, entry?.id ?? null)
    onApplied?.()
    onClose()
  }
  return (
    <Dialog title={title} onClose={onClose} size="md" testId="bulk-review">
      <div data-bulk-review>
        {review ? (
          <ChangeSetReview review={review} result={null} busy={busy}
            onToggle={(i, checked) => setReview({ ...review, items: review.items.map((it, j) => (j === i ? { ...it, checked } : it)) })}
            onApply={() => void apply()} onDiscard={onClose} onUndo={() => {}} />
        ) : <p className="text-body text-muted" role="status">{t('Preparing the changes…')}</p>}
      </div>
    </Dialog>
  )
}
