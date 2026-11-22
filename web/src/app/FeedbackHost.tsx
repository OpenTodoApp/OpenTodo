// Mounts the feedback dialog when it is requested (OpenSpec `feedback-door`, design D1). The
// dialog module loads on first open; the host itself is a few lines in the shell.
import { Suspense } from 'react'
import { lazy } from '../lib/lazy'
import { useFeedbackOpen } from '../lib/feedbackRequest'

const FeedbackDialog = lazy(() => import('./FeedbackDialog'))

export function FeedbackHost() {
  const open = useFeedbackOpen()
  if (!open) return null
  return <Suspense fallback={null}><FeedbackDialog /></Suspense>
}
