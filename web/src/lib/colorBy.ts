// Colour by (OpenSpec change calendar-clarity, design D3): which hue a calendar block,
// a Month or Plan row, or a board card's edge takes. Beside the hue mapping of
// ui/tokens/palette: every result is a palette hue, so the block recipe's fill, edge
// and contrast rules (3:1 edge in light and dark, checked by the token tests) hold
// whichever mode is chosen. A device preference, never synced.
import { hueFor, type HueName } from '../ui/tokens/palette'
import { getMeta, setMeta } from './db'
import { compareByPosition } from './ordering'
import type { Label, Project, Task } from './types'

export type ColorByMode = 'project' | 'label' | 'priority'
export const COLOR_BY_MODES: readonly ColorByMode[] = ['project', 'label', 'priority']

/** Device meta keys: one for the Calendar's four modes, one for every board. */
export const CALENDAR_COLOR_BY_KEY = 'calendar.colorBy'
export const BOARD_COLOR_BY_KEY = 'board.colorBy'

/** The hue of a task without a project, without a coloured label, or at priority 4: the Inbox's slate. */
export const NEUTRAL_HUE: HueName = 'slate'

/** The palette hues of the priority ring tokens (--ot-p1 red, --ot-p2 orange, --ot-p3 blue). */
export const PRIORITY_HUE: Readonly<Record<1 | 2 | 3, HueName>> = { 1: 'red', 2: 'orange', 3: 'blue' }

/** A stored value as a mode: anything missing or unknown reads as Project. */
export function normalizeColorBy(v: unknown): ColorByMode {
  return v === 'label' || v === 'priority' ? v : 'project'
}

export async function loadColorBy(key: string): Promise<ColorByMode> {
  return normalizeColorBy(await getMeta<unknown>(key, null))
}

export async function saveColorBy(key: string, mode: ColorByMode): Promise<void> {
  await setMeta(key, mode)
}

export interface ColorByContext {
  projects: ReadonlyMap<string, Pick<Project, 'color'>>
  /** Live labels by id; their `position` is the user's label order. */
  labels: ReadonlyMap<string, Pick<Label, 'id' | 'color' | 'position' | 'deleted_at'>>
}

/**
 * The hue of `task` under `mode`: its project's (the default); the first of its labels,
 * in the user's label order, whose colour is not the default grey; or its priority's.
 * Otherwise the neutral hue.
 */
export function colorBy(task: Pick<Task, 'project_id' | 'labels' | 'priority'>, mode: ColorByMode, ctx: ColorByContext): HueName {
  if (mode === 'priority') return task.priority === 1 || task.priority === 2 || task.priority === 3 ? PRIORITY_HUE[task.priority] : NEUTRAL_HUE
  if (mode === 'label') {
    const own = (task.labels ?? []).map((id) => ctx.labels.get(id)).filter((l): l is NonNullable<typeof l> => !!l && !l.deleted_at)
    own.sort(compareByPosition)
    for (const l of own) {
      const hue = hueFor(l.color)
      if (hue !== NEUTRAL_HUE) return hue
    }
    return NEUTRAL_HUE
  }
  return hueFor(task.project_id ? ctx.projects.get(task.project_id)?.color : null)
}
