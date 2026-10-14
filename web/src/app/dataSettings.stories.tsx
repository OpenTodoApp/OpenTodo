import type { Meta, StoryObj } from '@storybook/react-vite'
import { YourDataView } from './DataSettings'

const now = 1_760_000_060_000
const meta: Meta = { title: 'Settings/Data' }
export default meta
export const Owner: StoryObj = { render: () => <YourDataView demo={false} isOwner sync={{ state: 'idle', pending: 0, lastSyncedAt: now, error: null }} /> }
export const MemberWaiting: StoryObj = { render: () => <YourDataView demo={false} isOwner={false} sync={{ state: 'offline', pending: 3, lastSyncedAt: now - 3_600_000, error: null }} /> }
export const SyncError: StoryObj = { render: () => <YourDataView demo={false} isOwner sync={{ state: 'error', pending: 1, lastSyncedAt: null, error: 'The server answered 500.' }} /> }
export const Demo: StoryObj = { render: () => <YourDataView demo isOwner={false} sync={{ state: 'idle', pending: 0, lastSyncedAt: now, error: null }} /> }
