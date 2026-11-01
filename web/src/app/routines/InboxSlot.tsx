// Where the Inbox shows "Routines since your last visit" (routines-editor D10):
// inside the list, above the first task. The card's code loads only for a user
// who has at least one routine.
import { lazy, Suspense } from 'react'
import { useHasRoutines } from '../../lib/rules/hasRoutines'

const RoutinesInboxCard = lazy(() => import('./RoutinesInboxCard'))

export function RoutinesInboxSlot() {
  if (!useHasRoutines()) return null
  return <Suspense fallback={null}><RoutinesInboxCard /></Suspense>
}
