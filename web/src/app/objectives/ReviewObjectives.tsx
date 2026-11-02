// Objectives in the weekly review's Look ahead step (OpenSpec change
// plan-objectives, weekly-review "Objectives in the weekly review"): this
// quarter's, read-only; the planned week's with Add and edit (next week from
// Friday to Sunday, this week otherwise, with a toggle); the open objectives
// of the week before with Carry, Done and Drop; and in the first review of a new
// quarter, last quarter's open ones with the same three. Each action is one
// undoable batch; the section never changes whether the step is done.
import { useId, useState } from 'react'
import { t } from '../../lib/i18n'
import { canAdd, carryObjective, dropObjective, objectivesIn, reviewPlan, setObjectiveDone, useObjectives } from '../../lib/objectives'
import { periodDates, periodName } from '../../lib/sectorNames'
import { parseSector } from '../../lib/sectors'
import type { Objective } from '../../lib/types'
import { Button, TruncatedText } from '../../ui'
import { act } from '../actionError'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { ObjectiveGroup, type ObjectiveActions } from './ObjectiveCards'
import { objectiveActions, objectiveToast } from './objectiveActions'

export interface ReviewObjectivesViewProps {
  today: string
  rows: readonly Objective[]
  plan: ReturnType<typeof reviewPlan>
  onFlip: () => void
  actions?: ObjectiveActions
  onCarry?: (o: Objective, to: string) => void
  onDone?: (o: Objective) => void
  onDrop?: (o: Objective) => void
}

const carry = (o: Objective, to: string) => act(carryObjective(o.id, to).then(objectiveToast))
const done = (o: Objective) => act(setObjectiveDone(o.id, true).then(objectiveToast))
const drop = (o: Objective) => act(dropObjective(o.id).then(objectiveToast))

/** The presentational section (stories and tests pass rows). */
export function ReviewObjectivesView({ today, rows, plan, onFlip, actions = objectiveActions, onCarry = carry, onDone = done, onDrop = drop }: ReviewObjectivesViewProps) {
  const id = useId()
  const quarter = parseSector(plan.quarter)!
  const planned = parseSector(plan.planned)!
  const plannedName = plan.plansNext ? t('Objectives for next week') : t('Objectives for this week')
  const leftovers = (period: string | null) => (period ? objectivesIn(rows, period).filter((o) => !o.done_at) : [])
  const lastWeek = leftovers(plan.previousWeek)
  const lastQuarter = leftovers(plan.previousQuarter)
  const full = !canAdd(rows, plan.planned)
  const fullQuarter = !canAdd(rows, plan.quarter)
  const offers = (title: string, list: Objective[], to: string, blocked: boolean, key: string) => list.length > 0 && (
    <section aria-label={title} className="mt-3" data-objective-offers={key}>
      <h3 className="px-2 text-meta font-semibold text-muted">{title}</h3>
      <ul className="mt-1">
        {list.map((o) => (
          <li key={o.id} data-objective-offer={o.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1">
            <TruncatedText className="min-w-0 flex-1 truncate text-body text-default" text={o.title || t('Untitled')} />
            <span className="flex shrink-0 gap-1" role="group" aria-label={t('What to do with “{title}”', { title: o.title || t('Untitled') })}>
              <Button size="sm" variant="ghost" data-objective-carry disabled={blocked} onClick={() => onCarry(o, to)}>{t('Carry')}</Button>
              <Button size="sm" variant="ghost" data-objective-done onClick={() => onDone(o)}>{t('Done')}</Button>
              <Button size="sm" variant="ghost" data-objective-drop onClick={() => onDrop(o)}>{t('Drop')}</Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
  return (
    <section aria-label={t('Objectives')} data-review-objectives className="mb-4 rounded-card border border-default px-2 py-3">
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <ObjectiveGroup id={`${id}-q`} heading={periodName(quarter, today)} period={plan.quarter} items={objectivesIn(rows, plan.quarter)} canAdd={false} readOnly actions={actions} />
        <div className="min-w-0">
          <ObjectiveGroup id={`${id}-w`} heading={plannedName} dates={periodDates(planned)} period={plan.planned}
            items={objectivesIn(rows, plan.planned)} canAdd={!full} actions={actions} />
          <Button size="sm" variant="ghost" className="mt-1" data-objective-flip onClick={onFlip}>
            {plan.plansNext ? t('Plan this week instead') : t('Plan next week instead')}
          </Button>
        </div>
      </div>
      {offers(plan.plansNext ? t('Still open from this week') : t('Still open from last week'), lastWeek, plan.planned, full, 'week')}
      {offers(t('Still open from {quarter}', { quarter: plan.previousQuarter ? periodName(parseSector(plan.previousQuarter)!, today) : '' }), lastQuarter, plan.quarter, fullQuarter, 'quarter')}
      {(full && lastWeek.length > 0) && <p className="mt-1 px-2 text-meta text-muted">{t('Five is plenty. Finish or drop one first.')}</p>}
    </section>
  )
}

/** The section in Look ahead: the viewer's periods and live rows. */
export default function ReviewObjectives({ today, lastReviewAt }: { today: string; lastReviewAt: number }) {
  const weekStart = useDateTimeFormat().resolved.weekStart
  const [flip, setFlip] = useState(false)
  const plan = reviewPlan(today, weekStart, lastReviewAt, flip)
  const rows = useObjectives([plan.quarter, plan.planned, plan.previousWeek, ...(plan.previousQuarter ? [plan.previousQuarter] : [])])
  return <ReviewObjectivesView today={today} rows={rows} plan={plan} onFlip={() => setFlip((f) => !f)} />
}
