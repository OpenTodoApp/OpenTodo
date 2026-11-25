// The phone UI around a screen (OpenSpec change phone-all-screens): while the phone
// screens are on, every page draws its header as the phone's (the bar with the menu
// button or Back, the page's controls and menu, then the title large), its group
// headings without the filled bar, and its task rows as the phone row. A screen written for the phone needs nothing more;
// a screen that is not yet keeps its own content under the phone header.
import { useCallback, type ReactNode } from 'react'
import { TaskRowDrawContext, type TaskRowProps } from '../app/task-list/rowDraw'
import { GroupBarContext, PageHeaderDrawContext, type PageHeaderProps } from '../ui'
import { PhonePageHeader } from './components/PhonePageHeader'
import { PhoneTaskRow } from './screens/PhoneTaskRow'

const row = (p: TaskRowProps) => <PhoneTaskRow {...p} />

export function PhoneChrome({ onMenu, children }: { onMenu: () => void; children: ReactNode }) {
  const header = useCallback((p: PageHeaderProps) => <PhonePageHeader {...p} onMenu={onMenu} />, [onMenu])
  return <PageHeaderDrawContext value={header}><GroupBarContext value={false}><TaskRowDrawContext value={row}>{children}</TaskRowDrawContext></GroupBarContext></PageHeaderDrawContext>
}
