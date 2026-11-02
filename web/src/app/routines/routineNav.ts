// Getting to and from the routine editor page (OpenSpec change routines-editor-page
// D1, D5): a rule draft made from a view or a board column, or a starter's
// routine (routines-starters), handed to /routines/new in memory, and the routine whose row takes focus when the Routines page opens
// again. Kept tiny: views and boards import it with the first load.
import { resettable } from '../../lib/moduleState'
import { navigate } from '../router'
import type { RoutineDraft } from '../../lib/rules/draft'
import type { RuleDraft } from './ruleDraft'

let pending: RuleDraft | null = null
let pendingRoutine: RoutineDraft | null = null
let pendingDescribed: DescribedDraft | null = null
let returnTo: string | null = null

/** Open the editor page on a new routine made from a view's or a board column's rule. */
export function openRoutineDraft(draft: RuleDraft): void {
  pending = draft
  navigate({ view: 'rules', create: true })
}

/** Open the editor page on a new routine made from a starter, with its choices filled (routines-starters D5). */
export function openStarterDraft(draft: RoutineDraft): void {
  pendingRoutine = draft
  navigate({ view: 'rules', create: true })
}

/** What Describe it says about a draft it hands over (routines-describe-it D3). */
export interface DescribedDraft {
  /** The model's sentence for the person ("Email is not available, so…"), or ''. */
  note: string
}

/** Open the editor page on a routine the assistant drafted: unsaved, with the "Drafted by AI" banner. */
export function openDescribedDraft(draft: RoutineDraft, about: DescribedDraft): void {
  pendingRoutine = draft
  pendingDescribed = about
  navigate({ view: 'rules', create: true })
}

/** Describe it's note about the routine handed over, if it came from Describe it. */
export function pendingDescription(): DescribedDraft | null {
  return pendingDescribed
}

/** The starter's routine handed over, if any (read without clearing). */
export function pendingStarter(): RoutineDraft | null {
  return pendingRoutine
}

/** The draft handed over, if any (read without clearing; StrictMode reads twice). */
export function pendingDraft(): RuleDraft | null {
  return pending
}

/** The routine row the Routines page focuses when it opens next. */
export function setReturnFocus(id: string | null): void {
  returnTo = id
}

/** Read without clearing (StrictMode runs state initialisers twice); clear in an effect. */
export function returnFocus(): string | null {
  return returnTo
}

let historyFirst = false

/** Open a routine's page with its History shown (the row menu's History). */
export function openRoutineHistory(id: string): void {
  historyFirst = true
  navigate({ view: 'rules', id })
}

export function historyRequested(): boolean {
  return historyFirst
}

/** The page has read what it was handed: the draft, the History request, the row to focus. */
export function clearHandover(): void {
  pending = null
  pendingRoutine = null
  pendingDescribed = null
  historyFirst = false
  returnTo = null
}

resettable('routineNav', clearHandover)
