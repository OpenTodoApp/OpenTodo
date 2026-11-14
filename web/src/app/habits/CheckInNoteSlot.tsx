// The "How did it go?" line under the Today strip (habit-notes D2), out of the first
// load: the line and its store load with this chunk after the strip renders.
import { lazy, Suspense } from 'react'

const CheckInNote = lazy(() => import('./CheckInNote').then((m) => ({ default: m.CheckInNote })))

export function CheckInNoteSlot(props: { seriesId: string; title: string; className?: string }) {
  return <Suspense fallback={null}><CheckInNote {...props} /></Suspense>
}
