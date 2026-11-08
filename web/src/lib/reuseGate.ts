// Whether an add goes to a reusable list (OpenSpec reusable-lists): the one check
// quick add makes on every add, kept small so the matching, the aisles and the
// toast load only for a reusable list.
import { db } from './db'
import { isReusable } from './reusable'

interface AddTarget { project_id?: string | null; parent_id?: string | null; completed?: boolean }

/** True when one of the adds is a top-level item of a reusable list (wins and subtasks never reuse). */
export async function inReusableList(inputs: readonly AddTarget[]): Promise<boolean> {
  const ids = new Set(inputs.filter((i) => i.project_id && !i.parent_id && !i.completed).map((i) => i.project_id as string))
  for (const id of ids) if (isReusable(await db.projects.get(id))) return true
  return false
}
