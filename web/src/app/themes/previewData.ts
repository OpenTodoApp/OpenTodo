// The theme preview's sample data (OpenSpec change theme-editor, design D9): fixed
// tasks, a project and labels, the same for everyone and never the user's own, so
// the preview is quick, deterministic and the same in every bug report. Titles are
// translated; the colours are the palette's.
import { t } from '../../lib/i18n'
import type { Label, Project, Task } from '../../lib/types'
import { HUES, type HueName } from '../../ui'

const hex = (name: HueName): string => HUES.find((h) => h.name === name)!.hex

/** A fixed day the sample dates are relative to (a Wednesday). */
export const PREVIEW_TODAY = '2026-10-14'
const TOMORROW = '2026-10-15'

const task = (over: Partial<Task> & { id: string; title: string }): Task => ({
  description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0,
  created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, _clock: {}, ...over,
} as Task)

const label = (id: string, name: string, color: string): Label => ({ id, name, color, position: 0, created_at: 0, deleted_at: null, _clock: {} })

export interface PreviewData {
  project: Project
  labels: Label[]
  sections: { name: string; tasks: Task[] }[]
  columns: { name: string; tasks: Task[] }[]
  /** Week blocks: day index (0 = Monday), start and end hour, hue, title; `past` before today. */
  blocks: { day: number; from: number; to: number; hue: HueName; title: string; past?: boolean }[]
  allDay: { day: number; span: number; hue: HueName; title: string }[]
  panel: { task: Task; subtasks: { title: string; done: boolean }[]; comment: string }
}

/** The sample, built when the preview opens so its titles are in the current language. */
export function previewData(): PreviewData {
  const project: Project = { id: 'pv-home', name: t('Home renovation'), color: hex('green'), position: 0, archived: false, parent_id: null, created_at: 0, deleted_at: null, _clock: {} } as Project
  const errand = label('pv-errand', t('errand'), hex('orange'))
  const deep = label('pv-deep', t('deep-work'), hex('violet'))
  const waiting = label('pv-waiting', t('waiting'), hex('blue'))
  const tasks = {
    paint: task({ id: 'pv-1', title: t('Choose the paint for the hallway'), project_id: project.id, priority: 1, due: { date: PREVIEW_TODAY }, labels: [errand.id] }),
    quote: task({ id: 'pv-2', title: t('Ask the electrician for a quote'), project_id: project.id, priority: 2, due: { date: TOMORROW }, labels: [waiting.id] }),
    plan: task({ id: 'pv-3', title: t('Draw the kitchen plan'), project_id: project.id, priority: 3, estimate_minutes: 90, labels: [deep.id] }),
    tiles: task({ id: 'pv-4', title: t('Order the bathroom tiles'), project_id: project.id, deadline: '2026-10-20' }),
    skip: task({ id: 'pv-5', title: t('Book the skip'), project_id: project.id, completed_at: 1 }),
  }
  return {
    project,
    labels: [errand, deep, waiting],
    sections: [
      { name: t('This week'), tasks: [tasks.paint, tasks.quote, tasks.plan] },
      { name: t('Later'), tasks: [tasks.tiles, tasks.skip] },
    ],
    columns: [
      { name: t('To do'), tasks: [tasks.plan, tasks.tiles] },
      { name: t('Doing'), tasks: [tasks.paint] },
      { name: t('Done'), tasks: [tasks.skip, tasks.quote] },
    ],
    blocks: [
      { day: 0, from: 9, to: 11, hue: 'violet', title: t('Kitchen plan'), past: true },
      { day: 1, from: 14, to: 15, hue: 'orange', title: t('Paint shop'), past: true },
      { day: 2, from: 10, to: 12, hue: 'green', title: t('Site visit') },
      { day: 3, from: 9, to: 10, hue: 'blue', title: t('Electrician call') },
      { day: 4, from: 13, to: 16, hue: 'teal', title: t('Tiling') },
      { day: 2, from: 15, to: 16, hue: 'pink', title: t('Review the budget') },
    ],
    allDay: [{ day: 2, span: 3, hue: 'red', title: t('Builders on site') }],
    panel: {
      task: tasks.paint,
      subtasks: [{ title: t('Pick three samples'), done: true }, { title: t('Test them on the wall'), done: false }],
      comment: t('The warm white looked best in the evening light.'),
    },
  }
}
