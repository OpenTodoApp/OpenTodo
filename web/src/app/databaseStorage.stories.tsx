import type { Meta, StoryObj } from '@storybook/react-vite'
import type { StorageStatus } from '../lib/types'
import { DatabaseStorageView } from './DatabaseStoragePanel'

const MB = 1024 * 1024
const status = (patch: Partial<StorageStatus> = {}): StorageStatus => ({
  database_bytes: 48 * MB, free_bytes: 3 * MB, wal_bytes: 4 * MB, conversion: 'done',
  last_compaction: { at: 1_793_448_000_000, ops_removed: 12400, value_bytes_removed: 200 * MB, file_bytes_reclaimed: 210 * MB, more: false, converted: false },
  ...patch,
})

const meta: Meta = { title: 'Settings/Database storage' }
export default meta
export const Compacted: StoryObj = { render: () => <DatabaseStorageView status={status()} offline={false} error={null} /> }
export const NeverCompacted: StoryObj = { render: () => <DatabaseStorageView status={status({ last_compaction: null, conversion: 'waiting_for_quiet' })} offline={false} error={null} /> }
export const WaitingForDisk: StoryObj = { render: () => <DatabaseStorageView status={status({ database_bytes: 3000 * MB, conversion: 'no_space', conversion_needed_bytes: 3300 * MB })} offline={false} error={null} /> }
export const Offline: StoryObj = { render: () => <DatabaseStorageView status={null} offline error={null} /> }
