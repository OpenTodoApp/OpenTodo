// What an internal link in rendered Markdown reads as (OpenSpec change note-links,
// D2, D4), from the device's rows. Imported only by the lazy link chip.
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { t } from './i18n'
import type { Project, Task } from './types'

/**
 * What a link to a task, note or project reads as (note-links D2, D4): its title
 * and whether it is done, or null when it is missing or deleted.
 */
export function useRefTarget(kind: 'task' | 'note' | 'project', id: string): { title: string; done: boolean } | null | undefined {
  return useLiveQuery(async () => {
    const r = (await db[`${kind}s` as 'tasks'].get(id)) as (Task & Project) | undefined
    return r && !r.deleted_at ? { title: r.name ?? (r.title.trim() || t('Untitled note')), done: !!(r.completed_at || r.archived) } : null
  }, [kind, id])
}

