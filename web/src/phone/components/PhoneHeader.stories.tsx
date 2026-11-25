import type { Meta, StoryObj } from '@storybook/react-vite'
import { IconButton } from '../../ui'
import { PhoneFrame } from '../stories/frame'
import { more, noop } from '../stories/sample'
import { PhoneHeader } from './PhoneHeader'

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
