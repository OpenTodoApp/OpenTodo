// Today (native-app-everyday D1): the shared Today rule over the phone's database, in
// the shared groups: what was due earlier on top, the day, This Evening, and the tasks
// that wait for another one.
import { t } from '@shared/i18n'
import { useLive } from '../data/useLive'
import { useToday } from '../data/useToday'
import { todayGroups } from '../storage/lists'
import TaskSections, { type TaskSection } from '../ui/TaskSections'

export default function TodayScreen() {
  const today = useToday()
  const groups = useLive(() => todayGroups(today), ['tasks', 'projects'], [today])
  const sections: TaskSection[] | undefined = groups && [
    { key: 'earlier', title: t('Earlier'), data: groups.overdue },
    // The day's own tasks need a heading only under Earlier.
    { key: 'day', title: groups.overdue.length ? t('Today') : undefined, data: [...groups.day, ...groups.morning, ...groups.afternoon] },
    { key: 'evening', title: t('This Evening'), data: groups.evening },
    { key: 'blocked', title: t('Blocked'), data: groups.blocked },
  ].filter((s) => s.data.length)
  return <TaskSections sections={sections} testID="today-list" />
}
