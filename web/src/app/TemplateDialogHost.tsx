// "From a template…" (project-templates D6), asked for from the sidebar, the projects
// page, the Import screen and the command bar. The dialog loads when it opens.
import { Suspense, useEffect, useMemo, useState } from 'react'
import { lazy } from '../lib/lazy'
import { createStore } from '../lib/store'
import { PanelBoundary } from './PanelBoundary'

const TemplateDialog = lazy(() => import('./TemplateDialogs').then((m) => ({ default: m.TemplateDialog })))

const templateRequested = createStore('templateRequests', 0)
/** Ask the shell to open the From a template dialog. */
export function requestTemplateDialog(): void {
  templateRequested.update((n) => n + 1)
}
/** How many times the dialog was asked for (tests). */
export const templateRequests = templateRequested.get
const useTemplateRequests = templateRequested.use

/** Opens the From a template dialog whenever requestTemplateDialog() is called. */
export function TemplateDialogHost() {
  const requests = useTemplateRequests()
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(requests)
  useEffect(() => { if (requests !== seen) { setSeen(requests); setOpen(true) } }, [requests, seen])
  return useMemo(() => (open ? <PanelBoundary><Suspense fallback={null}><TemplateDialog onClose={() => setOpen(false)} /></Suspense></PanelBoundary> : null), [open])
}
