// "List…" in the project menu (OpenSpec reusable-lists, design D7): the Reusable
// list and Sort into aisles switches inside the menu's own overlay, anchored to
// the menu, never a modal. Turning aisles on asks once, in place, whether to add
// the missing aisle sections. Editors and above change the switches; a viewer
// sees them disabled.
import { lazy, Suspense } from 'react'
import { t } from '../../lib/i18n'
import { updateProject } from '../../lib/ops'
import { isReusable, sortsIntoAisles } from '../../lib/reusable'
import type { Project } from '../../lib/types'
import { act } from '../actionError'
import type { ActionItem, PickerSpec } from './ActionMenu'

// The step's content, with the aisle sections it can add, loads on first open.
const ListModeStep = lazy(() => import('./ListModeStep').then((m) => ({ default: m.ListModeStep })))

/** The project menu's "List…" step. */
export function listModeItem(project: Project, o: { canEdit: boolean }): ActionItem {
  return {
    kind: 'step', id: 'list-mode', label: t('List'), icon: 'shopping-cart',
    description: isReusable(project) ? t('Reusable list') : undefined,
    step: { title: t('List'), render: () => <Suspense fallback={<div className="h-24" aria-busy="true" />}><ListModeStep projectId={project.id} canEdit={o.canEdit} /></Suspense>, palette: o.canEdit ? listModePalette(project) : undefined },
  }
}

interface ListChoice { key: 'reusable' | 'aisles'; label: string; patch: Partial<Project> }

/** The same switches for the command palette: each choice flips one. */
function listModePalette(project: Project): PickerSpec<ListChoice> {
  const reusable = isReusable(project)
  const aisles = sortsIntoAisles(project)
  const source: ListChoice[] = [
    { key: 'reusable', label: reusable ? t('Turn off Reusable list') : t('Turn on Reusable list'), patch: { reusable: !reusable } },
    ...(reusable ? [{ key: 'aisles' as const, label: aisles ? t('Stop sorting into aisles') : t('Sort into aisles'), patch: { aisles: !aisles } }] : []),
  ]
  return {
    title: t('List'), source, getKey: (c) => c.key, getLabel: (c) => c.label,
    onPick: (c) => { act(updateProject(project.id, c.patch)) },
  }
}

