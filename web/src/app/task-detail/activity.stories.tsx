import type { Meta, StoryObj } from '@storybook/react-vite'
import { groupRuns } from '../../lib/activityRuns'
import type { ActivityEvent, ActivityKind } from '../../lib/types'
import { ActivityView } from './ActivityTab'

// Activity tab of the task panel (OpenSpec change task-detail-redesign, D6): a
// single event, a grouped run, a pending run and a compact comment line.
const meta: Meta = { title: 'Task/Activity' }
export default meta

const NOW = Date.UTC(2025, 9, 14, 12)
const MIN = 60_000
let n = 0
const ev = (kind: ActivityKind, actor: string, ago: number, changes: { field: string; from?: unknown; to?: unknown }[] = [], entityId = 't1'): ActivityEvent =>
  ({ id: `s${++n}`, kind, actor, entity: kind.startsWith('comment') ? 'comment' : 'task', entityId, taskId: 't1', ts: NOW - ago, opIds: [`sop${n}`], changes: changes.map((c) => ({ from: null, to: null, ...c })) })

const pendingRun = ev('edited', 'u-ada', 2 * MIN, [{ field: 'labels', from: [], to: ['l1'] }])
const events = [
  pendingRun,
  ev('commented', 'u-bob', 40 * MIN, [], 'c1'),
  ev('edited', 'u-ada', 3 * 60 * MIN, [{ field: 'priority', from: 4, to: 1 }]),
  ev('rescheduled', 'u-ada', 3 * 60 * MIN + 2 * MIN, [{ field: 'due', from: null, to: { date: '2025-10-20' } }]),
  ev('edited', 'u-ada', 3 * 60 * MIN + 4 * MIN, [{ field: 'title', from: 'Kickoff', to: 'Kick-off meeting' }]),
  ev('assigned', 'u-bob', 26 * 60 * MIN, [{ field: 'assignee_id', from: null, to: 'u-ada' }]),
]
const names: Record<string, string> = { 'u-ada': 'You', 'u-bob': 'Bob Okafor' }

export const Runs: StoryObj = {
  render: () => (
    <div className="max-w-md">
      <ActivityView runs={groupRuns(events, { pending: new Set(pendingRun.opIds) })} name={(id) => names[id] ?? 'Someone'} project={(id) => (id ? 'Work' : 'Inbox')}
        onOpenComment={() => {}} canLoadOlder loadState="idle" onLoadOlder={() => {}} now={NOW} />
    </div>
  ),
}

export const Empty: StoryObj = {
  render: () => (
    <div className="max-w-md">
      <ActivityView runs={[]} name={() => 'You'} project={() => 'Inbox'} onOpenComment={() => {}} canLoadOlder={false} loadState="idle" onLoadOlder={() => {}} now={NOW} />
    </div>
  ),
}
