// Inbox: the shared Inbox rule (no project, not scheduled) over the phone's database.
import { useLive } from '../data/useLive'
import { inboxList } from '../storage/lists'
import TaskSections from '../ui/TaskSections'

/** The Inbox's tasks, live; also the tab's badge. */
export function useInbox() {
  return useLive(inboxList, ['tasks', 'projects'], [])
}

export default function InboxScreen() {
  const tasks = useInbox()
  return <TaskSections sections={tasks && (tasks.length ? [{ key: 'inbox', data: tasks }] : [])} testID="inbox-list" />
}
