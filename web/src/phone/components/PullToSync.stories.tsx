import type { Meta, StoryObj } from '@storybook/react-vite'
import { PhoneFrame } from '../stories/frame'
import { PullToSync } from './PullToSync'

// Pull to sync (phone-delight D3): the pill under the bar while the list is pulled, armed, syncing and done.
const meta: Meta = { title: 'Phone/Components/Pull to sync' }
export default meta

const frame = (phase: 'pulling' | 'armed' | 'syncing' | 'done', offset: number) => (
  <PhoneFrame height={160}><div className="h-full bg-canvas"><PullToSync pull={{ phase, offset }} /></div></PhoneFrame>
)

export const Pulling: StoryObj = { name: 'Pulling', render: () => frame('pulling', 20) }
export const Armed: StoryObj = { name: 'Ready to release', render: () => frame('armed', 40) }
export const Done: StoryObj = { name: 'Synced', render: () => frame('done', 32) }
