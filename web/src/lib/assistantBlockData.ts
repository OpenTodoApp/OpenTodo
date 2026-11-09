// What the assistant's blocks read from the device (OpenSpec change
// assistant-generative-ui D4): live, so a block shows edits made since the answer,
// and imported only by the lazily loaded block renderers.
import { useLiveQuery } from 'dexie-react-hooks'
import type { AssistantBlock } from './assistantBlocks'
import { DEFAULT_GRID_PREFS, GRID_PREFS_META_KEY, normalizeGridPrefs } from './calendar'
import { db, getMeta } from './db'
import { localDueOf } from './dates'
import { t } from './i18n'
import { geoOf, locationLabel, placeEncrypted, shownLocation } from './locations'
import type { Note, Place, Project, Task } from './types'

/** The block's tasks in order: a row, or null for one that is gone (deleted, or not on this device). */
export function useBlockTasks(ids: readonly string[]): (Task | null)[] | undefined {
  const key = ids.join()
  return useLiveQuery(async () => (await db.tasks.bulkGet([...ids])).map((r) => (r && !r.deleted_at ? r : null)), [key])
}

/** The working day's length on this device (the calendar's grid settings). */
export function useDayLength(): number {
  return useLiveQuery(async () => normalizeGridPrefs(await getMeta<unknown>(GRID_PREFS_META_KEY, null)).dayLength, [], DEFAULT_GRID_PREFS.dayLength)
}

/** The live dated tasks whose local due falls on one of the days. */
export function useDatedTasks(days: readonly string[]): Task[] | undefined {
  const key = days.join()
  return useLiveQuery(async () => {
    const want = new Set(days)
    return db.tasks.filter((tk) => !tk.deleted_at && !!tk.due && want.has(localDueOf(tk.due)!.date)).toArray()
  }, [key])
}

/** One place on a map block: a task's place or a saved place. */
export interface MapItem { kind: 'task' | 'place'; id: string; title: string; where: string; lat?: number; lon?: number }

/** A map block's items in order, tasks first; gone and unreadable ones are left out. */
export function useMapItems(block: Extract<AssistantBlock, { kind: 'map' }>): MapItem[] | undefined {
  const key = `${block.task_ids?.join()}|${block.place_ids?.join()}`
  return useLiveQuery(async () => {
    const [tasks, places, all] = await Promise.all([db.tasks.bulkGet(block.task_ids ?? []), db.places.bulkGet(block.place_ids ?? []), db.places.toArray()])
    const byId = new Map<string, Place>(all.map((p) => [p.id, p]))
    const out: MapItem[] = []
    for (const tk of tasks) {
      if (!tk || tk.deleted_at) continue
      const shown = shownLocation(tk, byId)
      if (!shown || shown.encrypted) continue
      out.push({ kind: 'task', id: tk.id, title: tk.title, where: locationLabel(shown), lat: shown.lat, lon: shown.lon })
    }
    for (const p of places) {
      if (!p || p.deleted_at || placeEncrypted(p)) continue
      const g = geoOf(p)
      const geo = g && g !== 'encrypted' ? g : undefined
      out.push({ kind: 'place', id: p.id, title: p.name, where: p.address, lat: geo?.lat, lon: geo?.lon })
    }
    return out
  }, [key])
}

/** A note, null when gone; undefined while reading. */
export function useBlockNote(id: string): Note | null | undefined {
  const read = useLiveQuery(async () => ({ id, row: (await db.notes.get(id)) ?? null }), [id])
  return read?.id === id ? (read.row && !read.row.deleted_at ? read.row : null) : undefined
}

export interface OutlineSection { id: string | null; name: string; open: number }

/** A project with its live sections in order and their open top-level tasks; tasks without a section first. */
export function useProjectOutline(id: string): { project: Project | null; sections: OutlineSection[] } | undefined {
  return useLiveQuery(async () => {
    const project = await db.projects.get(id)
    if (!project || project.deleted_at) return { project: null, sections: [] }
    const [sections, tasks] = await Promise.all([
      db.sections.where('project_id').equals(id).filter((s) => !s.deleted_at).sortBy('position'),
      db.tasks.where('project_id').equals(id).filter((tk) => !tk.deleted_at && !tk.completed_at && !tk.parent_id).toArray(),
    ])
    const count = (sid: string | null) => tasks.filter((tk) => (tk.section_id ?? null) === sid).length
    const out: OutlineSection[] = sections.map((s) => ({ id: s.id, name: s.name, open: count(s.id) }))
    const loose = count(null)
    if (loose) out.unshift({ id: null, name: t('No section'), open: loose })
    return { project, sections: out }
  }, [id])
}
