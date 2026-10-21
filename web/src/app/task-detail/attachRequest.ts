// "Attach" from outside the attachments row (OpenSpec change task-panel-facets, D4):
// the Add menu and the header menu ask the open task's row to choose files; the row
// listens while it is mounted. Nothing is attached without the person picking files.
export type AttachKind = 'files' | 'link'
type Listener = (taskId: string, kind: AttachKind) => void
const listeners = new Set<Listener>()

/** Asks the attachments row of `taskId` to open its file chooser, or its link form. */
export function requestAttach(taskId: string, kind: AttachKind = 'files'): void {
  listeners.forEach((fn) => fn(taskId, kind))
}

/** Listens for attach requests; returns the function that stops listening. */
export function onAttachRequest(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
