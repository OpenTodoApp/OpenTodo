import { lazy, Suspense, useEffect, useId, useState, type KeyboardEvent, type RefObject } from 'react'
import { Kbd } from '../shortcuts/Kbd'
import type { Review, ReviewItem } from '../../lib/assistant'
import { editableFields, shapeOf, type ItemEdits, type ProposalShape } from '../../lib/assistantShape'
import { t } from '../../lib/i18n'
import { useMapsOn } from '../../lib/locations'
import { Icon, IconButton, SegmentedControl, Skeleton } from '../../ui'

// The calendar, outline and map shapes load with the first proposal that has one (assistant-generative-ui D5).
const ProposalShapeView = lazy(() => import('./blocks/ProposalShapes'))
// The editor loads when an item is first edited (assistant-proposal-editing D2: the shapes use it too).
const ItemEditor = lazy(() => import('./ItemEditor').then((m) => ({ default: m.ItemEditor })))
// Before and after (assistant-proposal-editing), in the shapes' chunk.
const BeforeAfterView = lazy(() => import('./blocks/ProposalShapes').then((m) => ({ default: m.BeforeAfter })))

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
  /** Edits a proposed value before applying (assistant-generative-ui D6). */
  onEdit?: (index: number, edits: ItemEdits) => void
  /** Show the proposal in its own shape (the assistant's; bulk actions keep the list). */
  shapes?: boolean
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

const SHAPE_LABEL: Record<Exclude<ProposalShape, 'list'>, () => string> = {
  calendar: () => t('Calendar'),
  outline: () => t('Outline'),
  map: () => t('Map'),
}

/** One item of the list: checkbox, title, marks, each change in words; Edit when it has editable fields. */
function ReviewRow({ item, index, p, editing, setEditing }: { item: ReviewItem; index: number; p: ChangeSetReviewProps; editing: boolean; setEditing: (i: number | null) => void }) {
  const label = `${item.title}${item.lines.length ? ': ' + item.lines.join('; ') : ''}`
  const canEdit = !!p.onEdit && editableFields(item).length > 0
  return (
    <li className="border-t border-soft first:border-t-0" data-review-item={item.change.entityId}>
      <div className="flex items-start">
        <label className="flex min-w-0 flex-1 flex-col gap-x-3 gap-y-0.5 px-3 py-2 text-body hover:bg-hover @md/review:flex-row @md/review:items-start">
          <span className="flex min-w-0 flex-1 items-start gap-2">
            <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-(--ot-accent)" checked={item.checked} onChange={(e) => p.onToggle(index, e.target.checked)}
              aria-label={label + (item.state === 'stale' ? ` ${t('(changed since proposed)')}` : '') + (item.shared ? ` ${t('(shared project)')}` : '') + (item.edited ? ` ${t('(edited)')}` : '')
                + (item.turn === 'added' ? ` ${t('(added this turn)')}` : item.turn === 'changed' ? ` ${t('(changed this turn)')}` : '')} />
            <span className="min-w-0 flex-1 user-text">
              <span className={item.checked ? 'text-default' : 'text-muted'}>{item.title}</span>
              {item.shared && <span className="ml-1.5 rounded-control border border-info px-1 text-hint font-medium text-on-info-soft">{t('shared')}</span>}
              {item.state === 'stale' && <span className="ml-1.5 rounded-control border border-warning px-1 text-hint font-medium text-on-warning-soft">{t('changed since proposed')}</span>}
              {item.edited && <span className="ml-1.5 rounded-control border border-default px-1 text-hint font-medium text-muted" data-edited>{t('edited')}</span>}
              {item.turn && <span className="ml-1.5 rounded-control border border-accent px-1 text-hint font-medium text-accent" data-turn={item.turn}>{item.turn === 'added' ? t('added') : t('changed')}</span>}
            </span>
          </span>
          {item.lines.length > 0 && (
            <span className="pl-6 text-meta text-muted user-text @md/review:max-w-[55%] @md/review:pl-0 @md/review:text-right">
              {item.lines.map((l) => <span key={l} className="block">{l}</span>)}
            </span>
          )}
        </label>
        {canEdit && <IconButton icon="pencil" size="sm" className="touch-target my-1 mr-1 text-muted" label={t('Edit {title}', { title: item.title })} aria-expanded={editing} onClick={() => setEditing(editing ? null : index)} data-edit-item />}
      </div>
      {editing && p.onEdit && <Suspense fallback={null}><ItemEditor item={item} index={index} onEdit={p.onEdit} onClose={() => setEditing(null)} /></Suspense>}
    </li>
  )
}

/**
 * The proposed change set (in-app-assistant D2, assistant-surface D4): a card with
 * a head (what it is, how many are selected, that nothing changes yet), the items in
 * their shape (assistant-generative-ui D5: a calendar, an outline or a map, the list
 * one switch away; the list's rows can be edited, D6) and a foot (Apply the selected,
 * Discard, the keys). Enter applies the checked items, Esc discards.
 */
export function ChangeSetReview(p: ChangeSetReviewProps) {
  const headingId = useId()
  const mapsOn = useMapsOn()
  const [asList, setAsList] = useState(false)
  const [compare, setCompare] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const review = p.review
  // A new proposal starts in its own shape, nothing being edited. A calendar stays one while it is
  // edited, so moving an item past the week does not turn it into the list (assistant-proposal-editing D1).
  const proposalKey = review ? review.items.map((i) => i.change.entity + i.change.entityId).join() : ''
  const liveShape: ProposalShape = review && p.shapes ? shapeOf(review, mapsOn) : 'list'
  const [kept, setKept] = useState<{ key: string; shape: ProposalShape } | null>(null)
  if (liveShape === 'calendar' && kept?.key !== proposalKey) setKept({ key: proposalKey, shape: liveShape })
  useEffect(() => { setAsList(false); setCompare(false); setEditing(null) }, [proposalKey])
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
  if (!review) return null
  const checked = review.items.filter((i) => i.checked).length
  const shape: ProposalShape = liveShape === 'list' && kept?.key === proposalKey ? kept.shape : liveShape
  const shown: ProposalShape = asList ? 'list' : shape
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName !== 'BUTTON') {
      e.preventDefault()
      if (!p.busy && checked > 0) p.onApply()
    }
  }
  return (
    <div ref={p.regionRef} role="group" aria-labelledby={headingId} onKeyDown={onKeyDown} data-assistant-review data-shape={shown}
      className="@container/review overflow-hidden rounded-card border border-default bg-surface">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-default px-3 py-2">
        <Icon name="pencil" size="sm" className="text-muted" />
        <h3 id={headingId} className="text-body font-semibold">{t('Proposed changes')}</h3>
        <span className="text-meta text-muted" data-assistant-selected>{t('{checked} of {count} selected', { checked, count: review.items.length })}</span>
        <span className="ml-auto flex items-center gap-1">
          {p.shapes && (
            <button type="button" aria-pressed={compare} onClick={() => setCompare(!compare)} data-before-after-switch
              className={`ui-btn ui-btn--sm ${compare ? 'ui-btn--secondary' : 'ui-btn--ghost text-muted'}`}>{t('Before and after')}</button>
          )}
          {shape !== 'list' && !compare && (
            <SegmentedControl label={t('Show the proposal as')} value={shown} onChange={(v) => setAsList(v === 'list')}
              options={[{ id: shape, label: SHAPE_LABEL[shape]() }, { id: 'list', label: t('List') }]} data-shape-switch />
          )}
        </span>
        <span className="basis-full text-meta text-faint">{t('Nothing changes until you apply')}</span>
      </div>
      {review.dropped.map((d) => <p key={d} className="border-b border-default px-3 py-1.5 text-meta text-muted">{d}</p>)}
      {compare ? (
        <Suspense fallback={<div className="p-3"><Skeleton shape="line" count={3} label={t('Before and after')} /></div>}>
          <BeforeAfterView review={review} />
        </Suspense>
      ) : shown === 'list' ? (
        <ul aria-label={t('Proposed changes')}>
          {review.items.map((item, i) => <ReviewRow key={item.change.entity + item.change.entityId} item={item} index={i} p={p} editing={editing === i} setEditing={setEditing} />)}
        </ul>
      ) : (
        <Suspense fallback={<div className="p-3"><Skeleton shape="line" count={3} label={t('Proposed changes')} /></div>}>
          <ProposalShapeView shape={shown} review={review} onToggle={p.onToggle} edits={{ onEdit: p.onEdit, editing, setEditing }} />
        </Suspense>
      )}
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
