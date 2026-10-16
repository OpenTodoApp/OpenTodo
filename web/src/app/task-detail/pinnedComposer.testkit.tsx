// Support for the pinned-composer test: a task with many comments in a fresh
// database, opened in the panel variant (the comments tab test file keeps its own
// fixture-based setup for everything else).
import 'fake-indexeddb/auto'
import { createComment } from '../../lib/comments'
import { useDatabase } from '../../lib/db'
import { createTask, resetDeviceId } from '../../lib/ops'
import { setCurrentUserId } from '../../lib/sharing'
import { flush, render } from '../../ui/test-utils'
import { TaskDetail } from './TaskDetail'

let n = 0
export async function setupPanelDb() {
  useDatabase(`pinned-${Date.now()}-${n++}`)
  resetDeviceId()
  setCurrentUserId('me')
}

export async function openPanel(comments: number) {
  const id = await createTask({ title: 'Long thread' })
  for (let i = 0; i < comments; i++) await createComment({ taskId: id, body: `Comment ${i + 1}` })
  const r = await render(<TaskDetail taskId={id} userId="me" projects={[]} labelMap={new Map()} onClose={() => {}} />)
  for (let item = 0; item < 2000 && r.container.querySelectorAll('[data-thread]').length < comments; item += 20) await flush(20)
  return r
}
