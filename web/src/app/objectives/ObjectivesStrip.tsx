// The Plan's Objectives strip (OpenSpec change plan-objectives, design D3):
// inside the content, above the columns, never chrome. A disclosure heading
// "Objectives", then this quarter's cards and this week's (and next week's when
// the Plan's span starts there). Collapsed or expanded is remembered on this
// device, expanded the first time. Below 640 px it is one summary line,
// "Q4: 3 · This week: 2", that opens the same groups in place.
import { useId, useState } from 'react'
import { readString, writeString } from '../../lib/deviceStorage'
import { t } from '../../lib/i18n'
import { canAdd, objectivePeriods, objectivesIn, useObjectives } from '../../lib/objectives'
import { periodDates, periodName, sectorWordName } from '../../lib/sectorNames'
import { parseSector } from '../../lib/sectors'
import type { Objective } from '../../lib/types'
import { Icon, useWide } from '../../ui'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { ObjectiveGroup, type ObjectiveActions } from './ObjectiveCards'
import { objectiveActions } from './objectiveActions'

const COLLAPSED_KEY = 'ot.objectives.collapsed'

export interface StripGroup {
  period: string
  heading: string
  dates: string
  /** The phone summary's short name: "Q4", "This week". */
  short: string
}

/** The strip's groups: this quarter, this week, and next week when the span starts in it. */
export function stripGroups(today: string, spanStart: string, weekStart: number): StripGroup[] {
  const p = objectivePeriods(today, weekStart)
  const spanWeek = objectivePeriods(spanStart, weekStart).week
  const q = parseSector(p.quarter)!
  const out: StripGroup[] = [
    { period: p.quarter, heading: periodName(q, today), dates: '', short: `Q${q.n}` },
    { period: p.week, heading: sectorWordName('this-week'), dates: periodDates(parseSector(p.week)!), short: sectorWordName('this-week') },
  ]
  if (spanWeek === p.nextWeek) out.push({ period: p.nextWeek, heading: sectorWordName('next-week'), dates: periodDates(parseSector(p.nextWeek)!), short: sectorWordName('next-week') })
  return out
}

/** The presentational strip: the groups over the given rows (stories and tests pass them). */
export function ObjectivesStripView({ groups, rows, wide, actions = objectiveActions, collapsed, onCollapsed }: {
  groups: StripGroup[]
  rows: readonly Objective[]
  wide: boolean
  actions?: ObjectiveActions
  collapsed: boolean
  onCollapsed: (collapsed: boolean) => void
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const body = (
    <div id={`${id}-body`} className={wide ? 'mt-2 grid gap-x-6 gap-y-3' : 'mt-2 space-y-3'}
      style={wide ? { gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` } : undefined}>
      {groups.map((g, i) => (
        <ObjectiveGroup key={g.period} id={`${id}-g${i}`} heading={g.heading} dates={g.dates} period={g.period} hintId={hintId}
          items={objectivesIn(rows, g.period)} canAdd={canAdd(rows, g.period)} actions={actions} />
      ))}
      <p id={hintId} className="sr-only">{t('Enter edits, Space marks done, Delete drops, Alt and the arrow keys move.')}</p>
    </div>
  )
  const summary = groups.map((g) => `${g.short}: ${rows.filter((o) => o.period === g.period && !o.deleted_at).length}`).join(' · ')
  return (
    <section aria-label={t('Objectives')} data-objectives-strip className="mb-3 rounded-card border border-default bg-surface px-2 py-2">
      <h2 className="m-0">
        <button type="button" aria-expanded={!collapsed} aria-controls={`${id}-body`} data-objectives-toggle
          className="flex w-full min-w-0 items-center gap-2 rounded-control px-2 py-1 text-left text-body font-semibold text-strong hover:bg-sunken focus-visible:outline-2 focus-visible:outline-focus"
          onClick={() => onCollapsed(!collapsed)}>
          <Icon name={collapsed ? 'chevron-right' : 'chevron-down'} size="sm" />
          <span>{t('Objectives')}</span>
          {(collapsed || !wide) && <span className="min-w-0 truncate font-normal text-muted" data-objectives-summary>{summary}</span>}
        </button>
      </h2>
      {!collapsed && body}
    </section>
  )
}

function readCollapsed(wide: boolean): boolean {
  const v = readString(COLLAPSED_KEY)
  // Expanded the first time on a wide screen; the phone starts on the summary line.
  return v === null ? !wide : v === '1'
}

/** The strip in the Plan: the viewer's periods and live rows. */
export default function ObjectivesStrip({ today, spanStart }: { today: string; spanStart: string }) {
  const weekStart = useDateTimeFormat().resolved.weekStart
  const wide = useWide()
  const groups = stripGroups(today, spanStart, weekStart)
  const rows = useObjectives(groups.map((g) => g.period))
  const [collapsed, setCollapsed] = useState(() => readCollapsed(wide))
  return (
    <ObjectivesStripView groups={groups} rows={rows} wide={wide} collapsed={collapsed}
      onCollapsed={(c) => { setCollapsed(c); if (wide) writeString(COLLAPSED_KEY, c ? '1' : '0') }} />
  )
}
