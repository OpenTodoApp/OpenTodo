// Inbox: the shared Inbox rule (no project, not scheduled) over the phone's database.
import { useLive } from '../data/useLive'
import { inboxList } from '../storage/lists'
import TaskList from '../ui/TaskList'

/** The Inbox's tasks, live; also the tab's badge. */
export function useInbox() {
  return useLive(inboxList, ['tasks', 'projects'], [])
}

export default function InboxScreen() {
  return <TaskList tasks={useInbox()} testID="inbox-list" />
}
