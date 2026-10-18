// The starter contexts (OpenSpec change open-loops-method, open-loops "Starter
// setup"): four context labels offered when someone chooses Open Loops and has no
// context yet, created as ordinary label operations, skipping a name that exists.
import { db } from '../db'
import { msg, t } from '../i18n'
import { createLabel, LabelExistsError } from '../labels'
import type { Label } from '../types'
import { isContext } from './rules'

export const STARTER_CONTEXTS = [msg('@home'), msg('@computer'), msg('@calls'), msg('@errands')] as const

/** Whether the user has a context label (a live label whose name starts with "@"). */
export const hasContext = (labels: readonly Label[]): boolean => labels.some((l) => isContext(l))

/** Creates the starter contexts in the interface language, skipping any label of the same name; returns the names created. */
export async function createStarterContexts(): Promise<string[]> {
  const existing = new Set((await db.labels.filter((l) => !l.deleted_at).toArray()).map((l) => l.name.trim().toLowerCase()))
  const created: string[] = []
  for (const source of STARTER_CONTEXTS) {
    const name = t(source)
    if (existing.has(name.toLowerCase())) continue
    try {
      await createLabel({ name })
      created.push(name)
    } catch (err) {
      if (!(err instanceof LabelExistsError)) throw err
    }
  }
  return created
}
