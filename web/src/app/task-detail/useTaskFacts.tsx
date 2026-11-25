// The facts of a task, in words (OpenSpec change task-full-page, design D1; shared
// with the phone task page by phone-ui-trial, design D4, D5): the task's properties
// as labelled facts under Schedule, Details and Project, each with its value in the
// list row's words or null when unset, and the one open part editor. The desktop
// facts column (TaskFacts) and the phone task page (PhoneTaskPage) both draw from
// this hook, so a fact is worded and ordered in one place.
import { useMemo, type ReactNode } from 'react'
import { useFeature } from '../../lib/features'
import type { FacetPart } from '../../lib/facets'
import { t } from '../../lib/i18n'
import { ReadAs, type IconName } from '../../ui'
import { ProjectMark } from '../ProjectMark'
import { OPTIONAL, type PropertiesProps, useFacetParts, usePartEditor } from './Facets'
import { usePropertiesModel } from './usePropertiesModel'
import { dayPartOf, dayPartWord } from '../../lib/dayParts'
import { energyLevelsOn } from '../../lib/energy'
import { useTimeSectors } from '../../lib/sectorPrefs'
import { useUserPrefsRow } from '../../lib/localData'
import { isNoPriority, priorityAccessibleName, priorityName } from '../../lib/priority'

const TONE: Record<string, string> = {
  overdue: 'text-danger',
  today: 'text-accent',
  warning: 'text-(--ot-hue-orange-text)',
}

/** The priority ring beside "Priority 2": the p1–p4 border tokens. */
const RING: Record<number, string> = { 1: 'border-p1', 2: 'border-p2', 3: 'border-p3', 4: 'border-p4' }

export interface Fact {
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

export function useTaskFacts(props: PropertiesProps) {
  const { task, userId } = props
  const m = usePropertiesModel(props)
  const pe = usePartEditor(m, task)
  // Every optional part is asked for, so each fact can read its value (the empty ones are ignored).
  const all = useMemo(() => new Set(OPTIONAL), [])
  const { facets, shownLocation } = useFacetParts(props, m, all)
  const parts = new Map<string, FacetPart>()
  for (const p of [...facets.where, ...facets.when, ...facets.how, ...facets.who]) if (!p.empty) parts.set(p.id, p)
  const text = (id: string) => parts.get(id)?.text ?? null
  const tone = (id: string) => TONE[parts.get(id)?.tone ?? ''] ?? undefined

  // Energy is offered while unset only with Energy levels on; a value is always shown (task-energy D3).
  const energyOn = energyLevelsOn(useUserPrefsRow())
  // Locations off in the current workspace: a set location still shows, none is offered (workspace-feature-switches D4).
  const locationsOn = useFeature('locations')
  const sectorsOn = useTimeSectors()
  const due = text('due')
  const partWord = dayPartWord(dayPartOf(task))
  const schedule: Fact[] = [
    { id: 'due', label: t('Do'), icon: 'sun', value: due && partWord ? `${due} · ${partWord}` : due ?? partWord, empty: t('Set a date'), tone: tone('due') },
    // The time sector (time-sectors D6): offered while unset only with the switch on; a value always shows.
    { id: 'sector', label: t('Time sector'), icon: 'calendar-range', value: text('sector'), empty: t('Set a time sector'), onlySet: !sectorsOn || !!task.recurrence },
    { id: 'when', label: t('Start'), icon: 'calendar-range', value: text('when'), empty: t('Set a start') },
    { id: 'deadline', label: t('Deadline'), icon: 'hourglass', value: text('deadline'), empty: t('Set a deadline'), tone: tone('deadline') },
    { id: 'reminders', label: t('Reminder'), icon: 'alarm-clock', value: text('reminders'), empty: t('Add a reminder') },
    { id: 'repeat', label: t('Repeat'), icon: 'repeat', value: text('repeat'), empty: t('Doesn’t repeat') },
  ]
  const details: Fact[] = [
    { id: 'priority', label: t('Priority'), icon: 'flag', empty: t('Set a priority'),
      value: isNoPriority(task.priority) ? null : <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`h-3 w-3 rounded-full border-2 ${RING[task.priority] ?? 'border-p4'}`} /><ReadAs label={priorityAccessibleName(task.priority)}>{priorityName(task.priority)}</ReadAs></span> },
    { id: 'estimate', label: t('Estimate'), icon: 'clock', value: text('estimate'), empty: t('Add an estimate') },
    { id: 'energy', label: t('Energy'), icon: 'zap', value: text('energy'), empty: t('Set energy'), onlySet: !energyOn },
    ...(userId ? [{ id: 'assignee', label: t('Assignee'), icon: 'user-check' as const, value: text('assignee'), empty: m.solo ? t('Assign to me') : t('Assign') }] : []),
    { id: 'blocked-by', label: t('Blocked by'), icon: 'lock', value: text('blocked-by'), empty: t('Add a blocker') },
    { id: 'blocks', label: t('Blocks'), icon: 'arrow-right', value: text('blocks'), empty: '', onlySet: true },
    { id: 'location', label: t('Location'), icon: 'map-pin', value: text('location'), empty: t('Add a place'), onlySet: !locationsOn },
  ]
  const where: Fact[] = [
    { id: 'project', label: t('Project'), icon: 'folder', empty: '',
      value: <span className="inline-flex min-w-0 items-center gap-1.5">{m.project && <ProjectMark project={m.project} />}<span className="truncate">{text('project')}</span></span> },
    ...(m.offerSection || m.shownSection ? [{ id: 'section', label: t('Section'), icon: 'kanban' as const, value: text('section'), empty: t('No section') }] : []),
    { id: 'parent', label: t('Parent task'), icon: 'corner-down-right', value: task.parent_id ? (props.parent?.title || t('Untitled')) : null, empty: t('Set a parent task') },
    { id: 'origin', label: t('Origin'), icon: 'link', value: text('origin'), empty: '', onlySet: true },
  ]

  return { m, pe, parts, schedule, details, where, shownLocation }
}
