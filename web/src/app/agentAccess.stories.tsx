import type { Meta, StoryObj } from '@storybook/react-vite'
import { AgentAccessView } from './AgentAccessRow'

// The share dialog's "AI assistants" row (agent-planning-fields D9).
const noop = () => {}
const card = (children: React.ReactNode) => <section className="max-w-md rounded-card border border-default bg-surface p-4 shadow-1 sm:p-6">{children}</section>

const meta: Meta = { title: 'Sharing/AI assistants' }
export default meta
export const Allowed: StoryObj = { render: () => card(<AgentAccessView keptAway={false} canChange onChange={noop} />) }
export const KeptAway: StoryObj = { render: () => card(<AgentAccessView keptAway canChange onChange={noop} />) }
export const Inherited: StoryObj = { render: () => card(<AgentAccessView keptAway through="Client X" canChange onChange={noop} />) }
export const Member: StoryObj = { render: () => card(<AgentAccessView keptAway={false} canChange={false} onChange={noop} />) }
export const Offline: StoryObj = { render: () => card(<AgentAccessView keptAway canChange offline onChange={noop} />) }
