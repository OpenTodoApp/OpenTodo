// The re-plan preview (OpenSpec change replan-the-day, design D4 and D8): on a wide
// screen the header's lead line becomes a bar (the count, the choice for the tasks
// that do not fit, Apply, Cancel) while the grid draws the ghosts; on a narrow one a
// bottom sheet lists each move. Nothing is written before Apply. A lazy chunk: only
// people who time-block and fall behind ever load it.
import { t } from '../../lib/i18n'
import { afterDeadline, type ReplanProposal, type UnfitChoice } from '../../lib/replan'
import type { Task } from '../../lib/types'
import { Button, Dialog, Select, ToneText } from '../../ui'
import { formatTime } from './grid'

export interface ReplanPreviewProps {
  variant: 'bar' | 'sheet'
  proposal: ReplanProposal
  /** Tasks by id, as shown (for titles and deadlines). */
  taskMap: Map<string, Task>
  today: string
  choice: UnfitChoice
  onChoice: (choice: UnfitChoice) => void
  /** Offline and today outside the device's event cache: packed around tasks only. */
  calendarsUnavailable: boolean
  onApply: () => void
  onCancel: () => void
}

/** "4 tasks move · 1 doesn't fit". */
export function replanSummary(p: ReplanProposal): string {
  const parts = [t('{n, plural, one {# task moves} other {# tasks move}}', { n: p.moves.length })]
  if (p.unfit.length > 0) parts.push(t('{n, plural, one {# doesn’t fit} other {# don’t fit}}', { n: p.unfit.length }))
  return parts.join(' · ')
}

export default function ReplanPreview(p: ReplanPreviewProps) {
  return p.variant === 'bar' ? <ReplanBar {...p} /> : <ReplanSheet {...p} />
}

function UnfitChoiceSelect({ choice, onChoice, className = '' }: Pick<ReplanPreviewProps, 'choice' | 'onChoice'> & { className?: string }) {
  return (
    <Select aria-label={t('Tasks that don’t fit')} value={choice} data-replan-choice className={className}
      onChange={(e) => onChoice(e.currentTarget.value === 'tomorrow' ? 'tomorrow' : 'leave')}>
      <option value="leave">{t('Leave them')}</option>
      <option value="tomorrow">{t('Move to tomorrow')}</option>
    </Select>
  )
}

function ReplanBar({ proposal, taskMap, today, choice, onChoice, calendarsUnavailable, onApply, onCancel }: ReplanPreviewProps) {
  const late = choice === 'tomorrow' ? proposal.unfit.filter((u) => afterDeadline(taskMap.get(u.id), today)) : []
  return (
    <span role="group" aria-label={t('Re-plan the rest of the day')} data-replan-bar className="inline-flex max-w-full items-center gap-2 text-meta">
      <span role="status" className="truncate text-default" data-replan-summary>{replanSummary(proposal)}</span>
      {calendarsUnavailable && <span className="truncate text-muted" data-replan-offline>{t('Calendars unavailable offline')}</span>}
      {proposal.unfit.length > 0 && <UnfitChoiceSelect choice={choice} onChoice={onChoice} className="w-auto py-0.5" />}
      {late.length > 0 && (
        <ToneText tone="warning" icon="circle-alert" data-replan-late="" label={`${t('After its deadline')}: ${late.map((u) => taskMap.get(u.id)?.title || t('Untitled')).join(', ')}`}>
          {t('After its deadline')}
        </ToneText>
      )}
      <Button variant="primary" size="sm" onClick={onApply} data-replan-apply>{t('Apply')}</Button>
      <Button variant="ghost" size="sm" onClick={onCancel} data-replan-cancel>{t('Cancel')}</Button>
    </span>
  )
}

function ReplanSheet({ proposal, taskMap, today, choice, onChoice, calendarsUnavailable, onApply, onCancel }: ReplanPreviewProps) {
  const title = (id: string) => taskMap.get(id)?.title || t('Untitled')
  return (
    <Dialog title={t('Re-plan the rest of the day')} onClose={onCancel} placement="sheet" testId="replan-sheet">
      <p role="status" className="text-meta text-muted" data-replan-summary>{replanSummary(proposal)}</p>
      {calendarsUnavailable && <p className="mt-1 text-meta text-muted" data-replan-offline>{t('Calendars unavailable offline')}</p>}
      {proposal.moves.length > 0 && (
        <ul className="mt-2 divide-y divide-soft" aria-label={t('Moves')}>
          {proposal.moves.map((m) => (
            <li key={m.id} data-replan-move={m.id} className="flex min-h-12 items-center gap-3">
              <span className="shrink-0 tabular-nums text-muted">{formatTime(m.start)} → {formatTime(m.to)}</span>
              <span className="min-w-0 truncate text-default">{title(m.id)}</span>
            </li>
          ))}
        </ul>
      )}
      {proposal.unfit.length > 0 && (
        <div className="mt-3">
          <h3 className="text-meta font-medium text-muted">{t('Doesn’t fit today')}</h3>
          <ul className="divide-y divide-soft">
            {proposal.unfit.map((u) => (
              <li key={u.id} data-replan-unfit={u.id} className="flex min-h-12 items-center gap-3">
                <span className="shrink-0 tabular-nums text-muted">{formatTime(u.start)}</span>
                <span className="min-w-0 flex-1 truncate text-default">{title(u.id)}</span>
                {choice === 'tomorrow' && afterDeadline(taskMap.get(u.id), today) && (
                  <ToneText tone="warning" icon="circle-alert" data-replan-late="">{t('After its deadline')}</ToneText>
                )}
              </li>
            ))}
          </ul>
          <UnfitChoiceSelect choice={choice} onChoice={onChoice} className="mt-1 min-h-12" />
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <Button variant="primary" className="min-h-12 flex-1" onClick={onApply} data-replan-apply>{t('Apply')}</Button>
        <Button variant="secondary" className="min-h-12 flex-1" onClick={onCancel} data-replan-cancel>{t('Cancel')}</Button>
      </div>
    </Dialog>
  )
}
