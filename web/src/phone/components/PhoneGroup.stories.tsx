import type { Meta, StoryObj } from '@storybook/react-vite'
import { PhoneFrame } from '../stories/frame'
import { lateRows, more, noop, todayRows } from '../stories/sample'
import { PhoneGroup } from './PhoneGroup'
import { PhoneRow } from './PhoneRow'

// A group of rows as one card (phone-ui-trial D5): its name and count, its menu, and a group that folds.
const meta: Meta = { title: 'Phone/Components/Group' }
export default meta

const rows = (list: typeof todayRows) => list.map((row) => <PhoneRow key={row.id} row={row} onToggle={noop} onOpen={noop} />)

export const Plain: StoryObj = {
  name: 'A group',
  render: () => <PhoneFrame height={380}><div className="pt-3"><PhoneGroup title="Today" count={todayRows.length}>{rows(todayRows)}</PhoneGroup></div></PhoneFrame>,
}

export const Overdue: StoryObj = {
  name: 'Overdue, with its menu',
  render: () => <PhoneFrame height={220}><div className="pt-3"><PhoneGroup title="Earlier" count={lateRows.length} tone="danger" action={more}>{rows(lateRows)}</PhoneGroup></div></PhoneFrame>,
}

export const Folded: StoryObj = {
  name: 'Folded and open',
  render: () => (
    <PhoneFrame height={330}>
      <div className="flex flex-col gap-4 pt-3">
        <PhoneGroup title="Waiting for a slot" count={2} folded onToggle={noop} />
        <PhoneGroup title="Blocked" count={2} folded={false} onToggle={noop} note="Today holds 3. The next one comes in when you finish one.">{rows(lateRows)}</PhoneGroup>
      </div>
    </PhoneFrame>
  ),
}
