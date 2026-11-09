// Linked references, loaded when first shown (note-links D5): the section and the
// link index are a chunk of their own, never part of the first load.
import { lazy, Suspense } from 'react'

const LinkedReferences = lazy(() => import('./LinkedReferences'))

export function LinkedRefs(props: { kind: 'task' | 'note' | 'project'; id: string; folded?: boolean }) {
  return <Suspense fallback={null}><LinkedReferences {...props} /></Suspense>
}
