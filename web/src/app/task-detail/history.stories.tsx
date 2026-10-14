import type { Meta, StoryObj } from '@storybook/react-vite'
import { toVersions } from '../../lib/historyVersions'
import type { ChangeSet, Label } from '../../lib/types'
import { HistoryView, type HistoryViewProps } from './HistoryTab'

// History tab of the task panel (OpenSpec change task-detail-redesign, D7):
// collapsed and expanded versions, a lost change and the offline state. Dates are
// in 2025 and "now" is fixed, so the rendering never depends on today.
const meta: Meta = { title: 'Task/History' }
export default meta

const NOW = Date.UTC(2025, 9, 14, 12)
const MIN = 60_000
const sets: ChangeSet[] = [
  { ts: NOW - 26 * 60 * MIN, device: 'laptop', userId: 'u-ada', changes: [{ opId: 'h1', field: 'title', from: 'Kickoff', to: 'Kick-off meeting' }, { opId: 'h2', field: 'due', from: null, to: { date: '2025-10-20', time: '09:30' } }] },
  { ts: NOW - 3 * 60 * MIN, device: 'phone', userId: 'u-bob', changes: [{ opId: 'h3', field: 'priority', from: 4, to: 1 }, { opId: 'h4', field: 'project_id', from: null, to: 'p-work' }, { opId: 'h5', field: 'labels', from: [], to: ['l1', 'l2'] }] },
  { ts: NOW - 20 * MIN, device: 'server', userId: 'u-ada', changes: [{ opId: 'h6', field: 'title', from: 'Kick-off meeting', to: 'Kick-off (API)', lost: true }] },
]
const labels = new Map<string, Label>([
  ['l1', { id: 'l1', name: 'planning', color: '#2563eb' } as Label],
  ['l2', { id: 'l2', name: 'urgent', color: '#dc2626' } as Label],
])
const base: HistoryViewProps = {
  state: 'idle', versions: toVersions(sets), labels, readOnly: false, canLoadOlder: true, now: NOW,
  author: (v) => ({ id: v.userId, name: v.userId === 'u-ada' ? 'You' : 'Bob Okafor', device: v.device === 'server' ? 'API' : v.device }),
  refName: (f, id) => (f === 'project_id' && id === 'p-work' ? 'Work' : undefined),
  onLoadOlder: () => {}, onRestoreValue: async () => {}, onRestoreVersion: async () => {},
}

export const Collapsed: StoryObj = { render: () => <div className="max-w-md"><HistoryView {...base} /></div> }
export const Expanded: StoryObj = { render: () => <div className="max-w-md"><HistoryView {...base} openIds={['h2', 'h5']} /></div> }
export const LostChange: StoryObj = { render: () => <div className="max-w-md"><HistoryView {...base} openIds={['h6']} /></div> }
export const Offline: StoryObj = { render: () => <div className="max-w-md"><HistoryView {...base} state="offline" versions={[]} /></div> }
