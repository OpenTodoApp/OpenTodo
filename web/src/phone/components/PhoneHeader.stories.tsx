import type { Meta, StoryObj } from '@storybook/react-vite'
import { IconButton } from '../../ui'
import { PhoneFrame } from '../stories/frame'
import { more, noop } from '../stories/sample'
import { PhoneHeader } from './PhoneHeader'
import { Ring } from './TodayGlance'

// The bar of a phone screen (phone-ui-trial D5): the control at the start, the title once the page's own has scrolled away, the screen's menu.
const meta: Meta = { title: 'Phone/Components/Header' }
export default meta

const menu = <IconButton icon="menu" label="Open menu" onClick={noop} className="touch-target" />

export const Resting: StoryObj = {
  name: 'Over a large title',
  render: () => <PhoneFrame height={120}><PhoneHeader lead={menu} title="Today" trailing={more} /></PhoneFrame>,
}

export const Titled: StoryObj = {
  name: 'With the title',
  render: () => <PhoneFrame height={120}><PhoneHeader lead={menu} title="Today" shown trailing={more} /></PhoneFrame>,
}

// phone-delight D9: on Today the bar keeps the day's progress once it has the title.
export const Progress: StoryObj = {
  name: 'With the day\'s progress',
  render: () => (
    <PhoneFrame height={120}>
      <PhoneHeader lead={menu} title="Today" shown trailing={more}
        progress={<span className="inline-flex items-center gap-1 text-meta text-muted tabular-nums"><Ring value={3} total={10} small />3/10</span>} />
    </PhoneFrame>
  ),
}
