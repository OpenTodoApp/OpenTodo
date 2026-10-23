// The facts column of the task page (OpenSpec change task-full-page, design D1):
// the task's properties as labelled rows under Schedule, Details, Labels and
// Project. A fact with a value reads in the list row's words; a fact without one is
// its own action in a quiet tone ("Set a deadline", "Add a place"), so nothing hides
// behind an Add menu. Every row opens the same popover editor as the panel's facet
// parts (Facets.tsx), anchored to the row, and writes the same operation.
import { useMemo, type ReactNode } from 'react'
import type { FacetPart } from '../../lib/facets'
import { t } from '../../lib/i18n'
import { Icon, type IconName } from '../../ui'
import { LabelChip } from '../LabelPicker'
import { LocationPreview } from '../locations/LocationPreview'
import { ProjectMark } from '../Sidebar'
import { OPTIONAL, PartEditor, type PropertiesProps, useFacetParts, usePartEditor } from './Facets'
import { usePropertiesModel } from './usePropertiesModel'

const TONE: Record<string, string> = {
  overdue: 'text-danger',
  today: 'text-accent',
  warning: 'text-(--ot-hue-orange-text)',
}

/** The priority ring beside "Priority 2": the p1–p4 border tokens. */
const RING: Record<number, string> = { 1: 'border-p1', 2: 'border-p2', 3: 'border-p3', 4: 'border-p4' }

interface Fact {
  id: string
  label: string
  icon: IconName
  /** The value in the row's words, or null when unset. */
  value: ReactNode | null
  /** The quiet action shown while unset. */
  empty: string
  tone?: string
  /** Shown only with a value (Blocks, the origin). */
  onlySet?: boolean
}

export function TaskFacts(props: PropertiesProps) {
  const { task, readOnly, userId } = props
  const m = usePropertiesModel(props)
  const pe = usePartEditor(m, task)
  // Every optional part is asked for, so each fact can read its value (the empty ones are ignored).
  const all = useMemo(() => new Set(OPTIONAL), [])
  const { facets, shownLocation } = useFacetParts(props, m, all)
  const parts = new Map<string, FacetPart>()
  for (const p of [...facets.where, ...facets.when, ...facets.how, ...facets.who]) if (!p.empty) parts.set(p.id, p)
  const text = (id: string) => parts.get(id)?.text ?? null
  const tone = (id: string) => TONE[parts.get(id)?.tone ?? ''] ?? undefined

  const due = text('due')
  const schedule: Fact[] = [
    { id: 'due', label: t('Do'), icon: 'sun', value: due && task.evening ? `${due} · ${t('evening')}` : due ?? (task.evening ? t('evening') : null), empty: t('Set a date'), tone: tone('due') },
    { id: 'when', label: t('Start'), icon: 'calendar-range', value: text('when'), empty: t('Set a start') },
    { id: 'deadline', label: t('Deadline'), icon: 'hourglass', value: text('deadline'), empty: t('Set a deadline'), tone: tone('deadline') },
    { id: 'reminders', label: t('Reminder'), icon: 'alarm-clock', value: text('reminders'), empty: t('Add a reminder') },
    { id: 'repeat', label: t('Repeat'), icon: 'repeat', value: text('repeat'), empty: t('Doesn’t repeat') },
  ]
  const details: Fact[] = [
    { id: 'priority', label: t('Priority'), icon: 'flag', empty: '',
      value: <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`h-3 w-3 rounded-full border-2 ${RING[task.priority] ?? 'border-p4'}`} />{t('Priority {n}', { n: task.priority })}</span> },
    { id: 'estimate', label: t('Estimate'), icon: 'clock', value: text('estimate'), empty: t('Add an estimate') },
    ...(userId ? [{ id: 'assignee', label: t('Assignee'), icon: 'user-check' as const, value: text('assignee'), empty: m.solo ? t('Assign to me') : t('Assign') }] : []),
    { id: 'blocked-by', label: t('Blocked by'), icon: 'lock', value: text('blocked-by'), empty: t('Add a blocker') },
    { id: 'blocks', label: t('Blocks'), icon: 'arrow-right', value: text('blocks'), empty: '', onlySet: true },
    { id: 'location', label: t('Location'), icon: 'map-pin', value: text('location'), empty: t('Add a place') },
  ]
  const where: Fact[] = [
    { id: 'project', label: t('Project'), icon: 'folder', empty: '',
      value: <span className="inline-flex min-w-0 items-center gap-1.5">{m.project && <ProjectMark project={m.project} />}<span className="truncate">{text('project')}</span></span> },
    ...(m.offerSection || m.shownSection ? [{ id: 'section', label: t('Section'), icon: 'kanban' as const, value: text('section'), empty: t('No section') }] : []),
    { id: 'parent', label: t('Parent task'), icon: 'corner-down-right', value: task.parent_id ? (props.parent?.title || t('Untitled')) : null, empty: t('Set a parent task') },
    { id: 'origin', label: t('Origin'), icon: 'link', value: text('origin'), empty: '', onlySet: true },
  ]

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
  const group = (name: string, id: string, body: ReactNode) => (
    <section aria-label={name} data-fact-group={id} className="space-y-0.5">
      <h3 className="mb-1 text-meta font-semibold text-muted">{name}</h3>
      {body}
    </section>
  )

  return (
    <section ref={m.section} aria-label={t('Properties')} className="space-y-5" data-facts>
      {group(t('Schedule'), 'schedule', schedule.map(row))}
      {group(t('Details'), 'details', <>{details.map(row)}<LocationPreview shown={shownLocation} /></>)}
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
      {!readOnly && pe.open && (
        <PartEditor id={pe.open} props={props} m={m} anchor={pe.anchor} segment={pe.segment} onSegment={pe.setSegment} onClose={pe.close} />
      )}
    </section>
  )
}
