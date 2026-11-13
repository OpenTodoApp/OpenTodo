// Today: the shared Today rule over the phone's database (src/storage/lists.ts).
import { useLive } from '../data/useLive'
import { useToday } from '../data/useToday'
import { todayTasks } from '../storage/lists'
import TaskList from '../ui/TaskList'

export default function TodayScreen() {
  const today = useToday()
  const tasks = useLive(() => todayTasks(today), ['tasks', 'projects'], [today])
  return <TaskList tasks={tasks} testID="today-list" />
}
