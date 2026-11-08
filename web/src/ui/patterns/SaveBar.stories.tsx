import type { Meta, StoryObj } from '@storybook/react-vite'
import { SaveBar } from './SaveBar'

const noop = () => {}
const frame = (children: React.ReactNode) => <div className="max-w-xl space-y-6 pt-4">{children}</div>

const meta: Meta = { title: 'UI/Save bar' }
export default meta
export const Unsaved: StoryObj = { render: () => frame(<SaveBar dirty onSave={noop} onDiscard={noop} />) }
export const Invalid: StoryObj = { render: () => frame(<SaveBar dirty invalid onSave={noop} onDiscard={noop} />) }
export const Offline: StoryObj = { render: () => frame(<SaveBar dirty disabledReason="Saving needs a connection to your server." onSave={noop} onDiscard={noop} />) }
export const Failed: StoryObj = { render: () => frame(<SaveBar dirty error="The server refused the change: the port must be a number." onSave={noop} onDiscard={noop} />) }
