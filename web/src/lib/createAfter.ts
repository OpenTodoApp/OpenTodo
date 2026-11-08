// A new task right after another (OpenSpec change add-below, GitHub issue 1036): the
// row menu's "Add task below" line. Loaded with that line, not on first load.
import { db } from './db'
import { moveTask } from './move'
import { createTask } from './ops'
import { effectiveSection } from './sections'
import type { Section, Task } from './types'

/**
 * A new task in `anchor`'s list right after `after`: the same project, parent and
 * section as `anchor`, created and then placed, like quick add's `o` insertion. Both
 * writes are local operations, so it works offline.
 */
export async function createTaskAfter(anchor: Task, after: string, title: string): Promise<string> {
  const sections = new Map<string, Section>()
  if (anchor.project_id) for (const s of await db.sections.where('project_id').equals(anchor.project_id).toArray()) sections.set(s.id, s)
  const section = anchor.parent_id === null ? effectiveSection(anchor, sections) : null
  const id = await createTask({ title, project_id: anchor.project_id, parent_id: anchor.parent_id, ...(section ? { section_id: section } : {}) })
  await moveTask(id, { parent_id: anchor.parent_id, ...(anchor.parent_id === null ? { section_id: section } : {}), at: { after } })
  return id
}
