import type { Meta, StoryObj } from '@storybook/react-vite'
import { LearnMore } from './LearnMore'

// The one "Learn more" (settings-refresh D2): a button that reads and points like a link.
const meta: Meta = { title: 'UI/Learn more' }
export default meta

export const InALine: StoryObj = {
  render: () => (
    <p className="max-w-md text-meta text-muted">
      Sign in with your fingerprint, face or device PIN. <LearnMore screen="settings/security" topic="Passkeys" className="text-meta" />
    </p>
  ),
}
