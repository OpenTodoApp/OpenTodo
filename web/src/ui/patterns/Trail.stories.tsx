import type { Meta, StoryObj } from '@storybook/react-vite'
import { Trail } from './Trail'

// OpenSpec accessibility "Location and link purpose" (accessibility-aaa D7).
const meta: Meta<typeof Trail> = { title: 'Patterns/Trail', component: Trail }
export default meta

export const NestedProject: StoryObj<typeof Trail> = {
  args: { label: 'You are here', steps: [{ label: 'Work', href: '/project/work' }, { label: 'Clients', href: '/project/clients' }] },
}

export const LongPath: StoryObj<typeof Trail> = {
  args: {
    label: 'You are here',
    steps: [
      { label: 'Home', href: '/project/home' }, { label: 'Renovation of the kitchen and the hall', href: '/project/reno' },
      { label: 'Quotes', href: '/project/quotes' }, { label: 'Electricians', href: '/project/el' },
    ],
  },
}
