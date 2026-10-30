// "Review every…" and "Put in maintenance" / "End maintenance" in the project menus
// (OpenSpec change project-review-cadence, design D6). The interval is personal
// (project_prefs.review_every), the status is shared (project.status) and offered
// only to those who may change the project's fields. Each choice is one op with
// Undo. Under Simple lists (`lists` mode) the items appear only once a value other
// than the default is stored, so it can be turned back; the walk card passes
// `always`.
import { t } from '../../lib/i18n'
import type { MethodMode } from '../../lib/method/mode'
import { inMaintenance, REVIEW_EVERY, REVIEW_EVERY_NAMES, reviewEveryOf, type ReviewEvery } from '../../lib/reviewCadence'
import type { Project } from '../../lib/types'
import { projectStatusUndoable, reviewEveryUndoable } from '../../lib/undoActions'
import { showUndoToast } from '../bulk/toastStore'
import type { ActionItem, PickerSpec } from './ActionMenu'

export async function setReviewEvery(projectId: string, every: ReviewEvery): Promise<void> {
  const r = await reviewEveryUndoable(projectId, every, every === 'paused' ? t('Reviews paused') : t('Review interval: {every}', { every: REVIEW_EVERY_NAMES[every] }))
  if (r.entry) showUndoToast(r.label, r.entry.id)
}

export async function setMaintenance(project: Pick<Project, 'id' | 'name'>, on: boolean): Promise<void> {
  const r = await projectStatusUndoable(project.id, on ? 'maintenance' : 'active', on ? t('{name} is in maintenance', { name: project.name }) : t('Maintenance ended for {name}', { name: project.name }))
  if (r.entry) showUndoToast(r.label, r.entry.id)
}

/** The interval choices, the current one checked (the submenu's items, and the walk card's menu). */
export function reviewEveryChoices(projectId: string, stored: string | undefined): ActionItem[] {
  const current = reviewEveryOf(stored)
  return REVIEW_EVERY.map((every) => ({
    kind: 'check' as const, id: `review-every-${every}`, label: REVIEW_EVERY_NAMES[every], checked: every === current,
    onSelect: () => setReviewEvery(projectId, every),
  }))
}

/** "Review every…" for a project, or null under Simple lists while the interval is the default. */
export function reviewEveryItem(projectId: string, stored: string | undefined, o: { mode: MethodMode; always?: boolean }): ActionItem | null {
  if (o.mode === 'lists' && !o.always && reviewEveryOf(stored) === 'week') return null
  return { kind: 'submenu', id: 'review-every', label: t('Review every'), icon: 'calendar-sync', items: reviewEveryChoices(projectId, stored) }
}

/** "Put in maintenance" or "End maintenance", or null: hidden from those who may not change the project, and under Simple lists for an active project. */
export function maintenanceItem(project: Pick<Project, 'id' | 'name' | 'status'>, o: { mode: MethodMode; canEdit: boolean; always?: boolean }): ActionItem | null {
  if (!o.canEdit) return null
  const on = inMaintenance(project)
  if (o.mode === 'lists' && !o.always && !on) return null
  return on
    ? { kind: 'action', id: 'maintenance-end', label: t('End maintenance'), icon: 'wrench', onSelect: () => setMaintenance(project, false) }
    : { kind: 'action', id: 'maintenance-start', label: t('Put in maintenance'), icon: 'wrench', description: t('Mutes the health warnings; deadlines still show'), onSelect: () => setMaintenance(project, true) }
}

type Choice = { every: ReviewEvery; label: string }

/** "Review every…" in the command palette: a picker over the five intervals. */
export function reviewEveryPicker(projectId: string, stored: string | undefined): PickerSpec<Choice> {
  const source: Choice[] = REVIEW_EVERY.map((every) => ({ every, label: REVIEW_EVERY_NAMES[every] }))
  return {
    title: t('Review every…'), placeholder: t('Find an interval…'), source,
    getKey: (c) => c.every, getLabel: (c) => c.label, selected: [reviewEveryOf(stored)],
    onPick: (c) => { void setReviewEvery(projectId, c.every) },
  }
}
