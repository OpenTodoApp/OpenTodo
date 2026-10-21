// The data and actions behind the task panel's property chips (OpenSpec change
// web-component-structure): live reads come from lib/liveData, every write is the
// same op the chips wrote before. Facets renders; this hook decides.
import { useEffect, useMemo, useRef, useState } from 'react'
import { localDueOf, zoneHint } from '../../lib/dates'
import { blockerCandidates, dependents, setBlockedBy } from '../../lib/dependencies'
import { t } from '../../lib/i18n'
import { resolveLabels } from '../../lib/labels'
import { useMembershipMap, useProjectLiveSections, useProjectTasks, useReminderCount } from '../../lib/liveData'
import { NO_TASKS, useLiveTasks } from '../../lib/liveTasks'
import { setTaskParent } from '../../lib/ops'
import { INBOX_KEY, parentSource, projectSource } from '../../lib/pickerSources'
import { effectiveSection } from '../../lib/sections'
import { isSoloScope, memberName } from '../../lib/sharing'
import type { Task } from '../../lib/types'
import { moveWithUndo } from '../undoable'
import { isInboxTask } from '../../lib/inbox'
import { useViewerZone } from '../useViews'
import type { PropertiesProps } from './Facets'
import { type Optional, usePropertyEditing } from './usePropertyEditing'

/** An error message from a failed write, shown beside its chip. */
const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err))

export function usePropertiesModel({ task, userId, projects, labelMap, parent, onOpen }: PropertiesProps) {
  const zone = useViewerZone()
  const projectId = task.project_id ?? null
  const memberships = useMembershipMap()
  const sections = useProjectLiveSections(projectId)
  // Tasks of the same project (any state): the parent picker applies its own rules.
  const projectTasks = useProjectTasks(projectId)
  const reminders = useReminderCount(task.id)
  const [parentError, setParentError] = useState<string | null>(null)
  const [blockError, setBlockError] = useState<string | null>(null)
  useEffect(() => { setParentError(null); setBlockError(null) }, [task.id])
  const section = useRef<HTMLElement>(null)
  // Every live task: blockers may sit in any project of the same sharing scope.
  const allTasks = useLiveTasks() ?? NO_TASKS

  const projectItems = useMemo(() => projectSource(projects, { current: projectId, memberships }), [projects, projectId, memberships])
  const sectionMap = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections])
  const parentItems = useMemo(() => {
    const list = parent && !projectTasks.some((tk) => tk.id === parent.id) ? [...projectTasks, parent] : projectTasks
    return parentSource(list, task, sections)
  }, [projectTasks, parent, task, sections])

  const taskById = useMemo(() => new Map(allTasks.map((tk) => [tk.id, tk])), [allTasks])
  const blockers = useMemo(() => (task.blocked_by ?? []).map((id) => taskById.get(id)).filter((tk): tk is Task => !!tk), [task.blocked_by, taskById])
  const blocks = useMemo(() => dependents(task.id, allTasks).filter((tk) => !tk.completed_at), [task.id, allTasks])
  const blockerItems = useMemo(() => [...blockers, ...blockerCandidates(task, allTasks, memberships)], [blockers, task, allTasks, memberships])
  // A task without a project is only "Inbox" while it is in the Inbox (inbox-means-unplaced): a dated one has no project.
  const projectName = (tk: Task) => (tk.project_id ? projects.find((p) => p.id === tk.project_id)?.name ?? t('Project') : isInboxTask(tk, (id) => taskById.get(id)) ? t('Inbox') : t('No project'))
  const toggleBlocker = async (id: string) => {
    setBlockError(null)
    try {
      const list = task.blocked_by ?? []
      await setBlockedBy(task.id, list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
    } catch (err) {
      setBlockError(messageOf(err))
    }
  }

  const currentProject = projectItems.find((i) => i.value === projectId)
  const moveTo = async (id: string | null) => {
    if (id === projectId) return
    const newId = await moveWithUndo(task.id, id, id ? projects.find((p) => p.id === id)?.name ?? t('the project') : t('Inbox'))
    if (newId !== task.id) onOpen?.(newId)
  }
  const changeParent = async (value: string | null) => {
    setParentError(null)
    try {
      await setTaskParent(task.id, value)
    } catch (err) {
      setParentError(messageOf(err))
    }
  }

  const sectionId = effectiveSection(task, sectionMap)
  const followsParent = !!parent && !parent.deleted_at
  const shownSection = followsParent ? effectiveSection(parent, sectionMap) : sectionId
  const solo = !!userId && isSoloScope(projectId, memberships, userId) && (!task.assignee_id || task.assignee_id === userId)
  const labels = resolveLabels(task.labels, labelMap)

  // Visible: set properties, plus the ones the Add menu revealed.
  const has: Record<Optional, boolean> = {
    deadline: !!task.deadline,
    when: !!task.start,
    evening: !!task.evening,
    reminders: reminders > 0,
    estimate: task.estimate_minutes !== null,
    repeat: !!task.recurrence,
    labels: labels.length > 0,
    assignee: !!task.assignee_id || (!!userId && !solo),
    'blocked-by': blockers.length > 0,
    parent: !!task.parent_id,
    section: !!shownSection,
    location: task.location != null,
  }
  const editing = usePropertyEditing(task.id, has, section)

  return {
    zone, projectId, sections, sectionMap, sectionId, shownSection, followsParent, section, editing,
    project: projectId ? projects.find((p) => p.id === projectId) : undefined,
    projectItems, currentProject, projectPins: [...(currentProject?.marker ? [currentProject.key] : []), INBOX_KEY], moveTo,
    parentItems, parentError, changeParent,
    blockers, blocks, blockerItems, blockError, toggleBlocker, projectName,
    solo, labels, reminders,
    local: localDueOf(task.due, zone),
    hint: zoneHint(task.due, zone),
    assigneeName: task.assignee_id ? (task.assignee_id === userId ? t('You') : memberName(task.assignee_id, memberships) ?? t('Former member')) : null,
    offerSection: !!projectId && sections.length > 0 && !followsParent,
  }
}

export type PropertiesModel = ReturnType<typeof usePropertiesModel>
