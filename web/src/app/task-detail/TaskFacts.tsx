// The facts column of the task page (OpenSpec change task-full-page, design D1):
// the task's properties as labelled rows under Schedule, Details, Labels and
// Project. A fact with a value reads in the list row's words; a fact without one is
// its own action in a quiet tone ("Set a deadline", "Add a place"), so nothing hides
// behind an Add menu. Every row opens the same popover editor as the panel's facet
// parts (Facets.tsx), anchored to the row, and writes the same operation.
import { useState, type ReactNode } from 'react'
import { t } from '../../lib/i18n'
import { Icon } from '../../ui'
import { LabelChip } from '../LabelPicker'
import { LocationPreview } from '../locations/LocationPreview'
import { PartEditor, type PropertiesProps } from './Facets'
import { type Fact, useTaskFacts } from './useTaskFacts'
import { RotationLine } from './RotationLine'

/**
 * The facts a phone's stacked card shows before "More" (precision-phone D4): every fact
 * with a value, the date and the deadline as actions while unset, priority only above 4.
 */
export function stackedFirst(f: { id: string; set: boolean; priority?: number }): boolean {
  if (f.id === 'priority') return (f.priority ?? 4) < 4
  return f.set || f.id === 'due' || f.id === 'deadline'
}

export function TaskFacts({ stacked = false, ...props }: PropertiesProps & { stacked?: boolean }) {
  const { task, readOnly, userId } = props
  const [allShown, setAllShown] = useState(false)
  const { m, pe, parts, schedule, details, where, shownLocation } = useTaskFacts(props)
  const row = (f: Fact) => {
    if ((f.onlySet || readOnly) && f.value === null) return null
    const fixed = readOnly || (f.id === 'origin' && parts.get('origin')?.fixed)
    const content = f.value ?? f.empty
    const cls = `flex min-h-8 min-w-0 items-center gap-2 rounded-control px-1.5 text-left text-body ${f.value === null ? 'text-faint' : f.tone ?? 'text-default'}`
    return (
      <div key={f.id} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2" data-fact={f.id}>
        <span className="truncate text-meta text-muted">{f.label}</span>
        {fixed ? (
          <span className={cls} data-part={f.id}><Icon name={f.icon} size="sm" className="shrink-0 text-faint" /><span className="min-w-0 truncate">{content}</span></span>
        ) : (
          <button type="button" ref={(el) => pe.partRef(f.id, el)} data-part={f.id}
            aria-expanded={f.id === 'origin' ? undefined : pe.open === f.id} aria-haspopup={f.id === 'origin' ? undefined : 'dialog'}
            className={`${cls} hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${pe.open === f.id ? 'bg-hover' : ''}`}
            onClick={() => pe.activate(f.id)}>
            <Icon name={f.icon} size="sm" className="shrink-0 text-faint" />
            {/* The fact's name is read first; the visible text stays part of the name (label-content-name-match). */}
            <span className="sr-only">{`${f.label}: `}</span>
            <span className="min-w-0 truncate">{content}</span>
          </button>
        )}
      </div>
    )
  }
  const editor = !readOnly && pe.open && (
    <PartEditor id={pe.open} props={props} m={m} anchor={pe.anchor} segment={pe.segment} onSegment={pe.setSegment} onClose={pe.close} />
  )

  if (stacked) {
    // The phone's facts (precision-phone D4): one card of 44 px rows, the icon and the
    // fact's name on the left, its value or action on the right; the unset ones wait behind More.
    const facts = [...schedule, ...details, ...where].filter((f) => !((f.onlySet || readOnly) && f.value === null))
    const first = facts.filter((f) => stackedFirst({ id: f.id, set: f.value !== null, priority: task.priority }))
    // An editor opened for a hidden row (the list's `b` or `e`) shows them all, so it has its row to anchor to.
    const expanded = allShown || (!!pe.open && !first.some((f) => f.id === pe.open) && !(pe.open === 'labels' && m.labels.length > 0))
    const shown = expanded ? facts : first
    const hiddenCount = facts.length - first.length + (m.labels.length ? 0 : readOnly ? 0 : 1)
    const stackedRow = (f: Fact) => {
      const fixed = readOnly || (f.id === 'origin' && parts.get('origin')?.fixed)
      const inner = <>
        <Icon name={f.icon} size="sm" className="shrink-0 text-faint" />
        <span className="shrink-0 text-muted">{f.label}</span>
        <span className={`ml-auto min-w-0 truncate text-right ${f.value === null ? 'text-faint' : f.tone ?? 'text-default'}`}>{f.value ?? f.empty}</span>
      </>
      const cls = 'flex min-h-11 w-full min-w-0 items-center gap-3 px-3 text-left text-body'
      return (
        <li key={f.id} data-fact={f.id}>
          {fixed ? <span className={cls} data-part={f.id}>{inner}</span> : (
            <button type="button" ref={(el) => pe.partRef(f.id, el)} data-part={f.id}
              aria-expanded={f.id === 'origin' ? undefined : pe.open === f.id} aria-haspopup={f.id === 'origin' ? undefined : 'dialog'}
              className={`${cls} hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus ${pe.open === f.id ? 'bg-hover' : ''}`}
              onClick={() => pe.activate(f.id)}>{inner}</button>
          )}
        </li>
      )
    }
    const labelsRow = (m.labels.length > 0 || (expanded && !readOnly)) && (
      <li key="labels" data-fact="labels">
        <button type="button" ref={(el) => pe.partRef('labels', el)} data-part="labels" aria-haspopup="dialog" aria-expanded={pe.open === 'labels'} disabled={readOnly}
          className="flex min-h-11 w-full min-w-0 items-center gap-3 px-3 text-left text-body hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
          onClick={() => pe.activate('labels')}>
          <Icon name="tag" size="sm" className="shrink-0 text-faint" />
          <span className="shrink-0 text-muted">{t('Labels')}</span>
          <span className="ml-auto flex min-w-0 flex-wrap justify-end gap-1">
            {m.labels.length ? m.labels.map((l) => <LabelChip key={l.id} label={l} />) : <span className="text-faint">{t('Add labels')}</span>}
          </span>
        </button>
      </li>
    )
    return (
      <section ref={m.section} aria-label={t('Properties')} data-facts="stacked">
        <ul className="divide-y divide-soft">
          {shown.map(withTurns(stackedRow, (n) => <RotationLine key={n} as="li" className="px-3 py-1.5" task={task} userId={userId} />))}
          {labelsRow}
          {!expanded && hiddenCount > 0 && (
            <li>
              <button type="button" className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-body text-muted hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
                onClick={() => setAllShown(true)} data-facts-more>
                <Icon name="ellipsis" size="sm" className="shrink-0 text-faint" />{t('More properties')}
              </button>
            </li>
          )}
        </ul>
        <LocationPreview shown={shownLocation} />
        {editor}
      </section>
    )
  }

  const group = (name: string, id: string, body: ReactNode) => (
    <section aria-label={name} data-fact-group={id} className="space-y-0.5">
      <h3 className="mb-1 text-meta font-semibold text-muted">{name}</h3>
      {body}
    </section>
  )

  return (
    <section ref={m.section} aria-label={t('Properties')} className="space-y-5" data-facts>
      {group(t('Schedule'), 'schedule', schedule.map(row))}
      {group(t('Details'), 'details', <>{details.map(withTurns(row, (n) => <RotationLine key={n} as="div" className="pl-[7rem]" task={task} userId={userId} />))}<LocationPreview shown={shownLocation} /></>)}
      {group(t('Labels'), 'labels', (
        <div className="flex flex-wrap items-center gap-1" data-fact="labels">
          {m.labels.map((l) => <LabelChip key={l.id} label={l} />)}
          {!readOnly && (
            <button type="button" ref={(el) => pe.partRef('labels', el)} data-part="labels" aria-haspopup="dialog" aria-expanded={pe.open === 'labels'}
              aria-label={m.labels.length ? t('Edit labels') : t('Add labels')}
              className={`inline-flex min-h-7 items-center gap-1 rounded-control px-1.5 text-meta hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus ${m.labels.length ? 'text-muted' : 'text-faint'}`}
              onClick={() => pe.activate('labels')}>
              <Icon name={m.labels.length ? 'plus' : 'tag'} size="xs" />{m.labels.length ? null : t('Add labels')}
            </button>
          )}
          {readOnly && m.labels.length === 0 && <span className="text-meta text-faint">{t('No labels')}</span>}
        </div>
      ))}
      {group(t('Project'), 'where', where.map(row))}
      {editor}
    </section>
  )
}

/** A fact row renderer that adds the "Takes turns" line under the assignee (chore-rotation D5). */
function withTurns<F extends { id: string }>(render: (f: F) => ReactNode, line: (key: string) => ReactNode): (f: F) => ReactNode {
  return (f) => (f.id === 'assignee' ? [render(f), line('assignee-turns')] : render(f))
}
