// "Flow…" in the project and section menus (OpenSpec change project-flow-modes,
// design D7): a submenu of choices with a one-line description each, the current
// one checked. One op with Undo per choice. Under Simple lists (`lists` mode) the
// item appears only where a flow other than the default is stored, so it can be
// turned back; the command palette offers the project's in every mode.
import { projectFlowOf, sectionFlowOf, type ProjectFlow, type SectionFlow } from '../../lib/flow'
import { t } from '../../lib/i18n'
import type { MethodMode } from '../../lib/method/mode'
import type { Project, Section } from '../../lib/types'
import { flowUndoable } from '../../lib/undoActions'
import { showUndoToast } from '../bulk/toastStore'
import type { ActionItem, PickerSpec } from './ActionMenu'

export function projectFlowName(flow: ProjectFlow): string {
  switch (flow) {
    case 'parallel': return t('Parallel')
    case 'sequential': return t('Sequential')
    case 'area': return t('Area')
  }
}

function projectFlowDescription(flow: ProjectFlow): string {
  switch (flow) {
    case 'parallel': return t('Every task can be done at any time')
    case 'sequential': return t('One step at a time, in list order')
    case 'area': return t('An ongoing list that never finishes')
  }
}

async function setFlow(entity: 'project' | 'section', id: string, flow: string, label: string) {
  const r = await flowUndoable(entity, id, flow, label)
  if (r.entry) showUndoToast(r.label, r.entry.id)
}

/** The project's flow choices (the submenu's items, and the palette's). */
export function projectFlowChoices(project: Pick<Project, 'id' | 'flow_mode'>): ActionItem[] {
  const current = projectFlowOf(project)
  return (['parallel', 'sequential', 'area'] as const).map((flow) => ({
    kind: 'check' as const, id: `flow-${flow}`, label: projectFlowName(flow), description: projectFlowDescription(flow), checked: flow === current,
    onSelect: () => setFlow('project', project.id, flow, t('Flow set to {flow}', { flow: projectFlowName(flow) })),
  }))
}

type Choice = { flow: ProjectFlow; label: string; description: string }

/** "Set project flow…" in the command palette (every mode): a picker over the three flows. */
export function projectFlowPicker(project: Pick<Project, 'id' | 'flow_mode'>): PickerSpec<Choice> {
  const source: Choice[] = (['parallel', 'sequential', 'area'] as const).map((flow) => ({ flow, label: projectFlowName(flow), description: projectFlowDescription(flow) }))
  return {
    title: t('Set project flow'), placeholder: t('Find a flow…'), source,
    getKey: (c) => c.flow, getLabel: (c) => c.label, getSecondary: (c) => c.description, selected: [projectFlowOf(project)],
    onPick: (c) => { void setFlow('project', project.id, c.flow, t('Flow set to {flow}', { flow: c.label })) },
  }
}

/** "Flow…" for a project, or null: hidden from those who may not change the project, and under Simple lists while the flow is the default. */
export function projectFlowItem(project: Pick<Project, 'id' | 'flow_mode'>, o: { mode: MethodMode; canEdit: boolean; always?: boolean }): ActionItem | null {
  if (!o.canEdit) return null
  if (o.mode === 'lists' && !o.always && projectFlowOf(project) === 'parallel') return null
  return { kind: 'submenu', id: 'flow', label: t('Flow'), icon: 'list-ordered', items: projectFlowChoices(project) }
}

/** "Flow…" for a section, or null: for those who may rename it, and under Simple lists only once a flow is stored. */
export function sectionFlowItem(section: Pick<Section, 'id' | 'flow_mode'>, project: Pick<Project, 'flow_mode'> | undefined, o: { mode: MethodMode; canEdit: boolean }): ActionItem | null {
  if (!o.canEdit) return null
  const current = sectionFlowOf(section)
  if (o.mode === 'lists' && current === '') return null
  const follows = projectFlowOf(project) === 'sequential' ? t('Sequential') : t('Parallel')
  const choices: { flow: SectionFlow; label: string; description: string }[] = [
    { flow: '', label: t('Follow project ({flow})', { flow: follows }), description: t('Works like the project') },
    { flow: 'parallel', label: t('Parallel'), description: t('All its tasks together, as one step') },
    { flow: 'sequential', label: t('Sequential'), description: t('Its tasks one at a time, in list order') },
  ]
  return {
    kind: 'submenu', id: 'section-flow', label: t('Flow'), icon: 'list-ordered',
    items: choices.map((c) => ({
      kind: 'check' as const, id: `section-flow-${c.flow || 'follow'}`, label: c.label, description: c.description, checked: c.flow === current,
      onSelect: () => setFlow('section', section.id, c.flow, t('Section flow changed')),
    })),
  }
}
