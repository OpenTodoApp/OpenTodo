// Quick add and reusable lists (OpenSpec reusable-lists, design D3): every quick add
// that creates in a project (the list, a section, the phone sheet, the command bar)
// goes through addToList. Outside a reusable list it is the plain create; in one,
// the matching and its toast load lazily (app/reuseList.ts).
import { createTask, type NewTaskInput } from '../lib/ops'
import { inReusableList } from '../lib/reuseGate'

/** Adds one item, reusing an item of a reusable list it matches; returns the id of the item now on the list. */
export async function addToList<T extends NewTaskInput>(input: T, create: (input: T) => Promise<string>): Promise<string> {
  if (!(await inReusableList([input]))) return create(input)
  return (await import('./reuseList')).addToList(input, create)
}

/** addToList with createTask, for a screen that follows a new task: its id, or null when the list reused an item. */
export async function createUnlessReused(input: NewTaskInput): Promise<string | null> {
  let created = false
  const id = await addToList(input, (x) => { created = true; return createTask(x) })
  return created ? id : null
}

/** A pasted list: each line follows the rule on its own (see reuseList.addManyToList). */
export async function addManyToList<T extends NewTaskInput>(inputs: readonly T[], createMany: (inputs: T[]) => Promise<unknown>): Promise<void> {
  if (!(await inReusableList(inputs))) { await createMany([...inputs]); return }
  return (await import('./reuseList')).addManyToList(inputs, createMany)
}
