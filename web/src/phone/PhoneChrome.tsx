// The phone UI around a screen (OpenSpec change phone-all-screens): while the phone
// screens are on, every page draws its header as the phone's (the bar with the menu
// button or Back, the page's controls and menu, then the title large), its group
// headings without the filled bar, and its task rows as the phone row. A screen written for the phone needs nothing more;
// a screen that is not yet keeps its own content under the phone header.
import { useCallback, type ReactNode } from 'react'
import { CalendarRowDrawContext, RowPreviewContext, TaskRowDrawContext, type CalendarRowProps, type TaskRowProps } from '../app/task-list/rowDraw'
import type { Task } from '../lib/types'
import { RowPreview } from './components/RowPreview'
import { GroupBarContext, PageHeaderDrawContext, type PageHeaderProps } from '../ui'
import { PhonePageHeader } from './components/PhonePageHeader'
import { PhoneCalendarRow } from './screens/PhoneCalendarRow'
import { PhoneTaskRow } from './screens/PhoneTaskRow'

const row = (p: TaskRowProps) => <PhoneTaskRow {...p} />
const calendarRow = (p: CalendarRowProps) => <PhoneCalendarRow key={p.task.id} {...p} />
const preview = (task: Task) => <RowPreview task={task} />

export function PhoneChrome({ onMenu, children }: { onMenu: () => void; children: ReactNode }) {
  const header = useCallback((p: PageHeaderProps) => <PhonePageHeader {...p} onMenu={onMenu} />, [onMenu])
  return <PageHeaderDrawContext value={header}><GroupBarContext value={false}><TaskRowDrawContext value={row}><CalendarRowDrawContext value={calendarRow}><RowPreviewContext value={preview}>{children}</RowPreviewContext></CalendarRowDrawContext></TaskRowDrawContext></GroupBarContext></PageHeaderDrawContext>
}
