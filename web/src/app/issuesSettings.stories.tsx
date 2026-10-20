import type { Meta, StoryObj } from '@storybook/react-vite'
import type { IssueConnection } from '../lib/types'
import { IssuesView, type IssuesViewProps } from './IssuesPanel'

// Settings → Integrations → Issues (OpenSpec change issue-import, task 5.4).

const noop = () => {}
const now = 1_760_000_060_000

const conn = (over: Partial<IssueConnection> = {}): IssueConnection => ({
  id: 'c1', provider: 'github', host: 'https://github.com', name: 'Work', project_id: 'p1',
  filter: { scope: 'assigned', repositories: [], labels: [] }, map_labels: true, enabled: true, interval_minutes: 30,
  state: 'ok', next_poll_at: now + 1_200_000, last_poll_at: now - 720_000, last_success_at: now - 720_000, last_error: '', last_error_at: null,
  stopped_reason: '', account_login: 'ada', can_read_issues: true,
  last_run: { created: 3, completed: 1, reopened: 0, renamed: 2, unlinked: 0, partial: false }, task_count: 24, token_set: true,
  created_at: now - 86_400_000 * 9, updated_at: now - 720_000, ...over,
})
const gitlab = conn({ id: 'c2', provider: 'gitlab', host: 'https://gitlab.example.com', name: 'gitlab.example.com', project_id: null, account_login: 'ada.l',
  filter: { scope: 'repositories', repositories: ['infra/deploy', 'infra/monitoring'], labels: ['bug'] }, map_labels: false, interval_minutes: 60, task_count: 7 })

const view = (over: Partial<IssuesViewProps> = {}) => (
  <IssuesView isOwner enabled connected encrypted={false} connections={[conn(), gitlab]} projects={[{ id: 'p1', name: 'Work' } as IssuesViewProps['projects'][number]]}
    busy={false} polling={new Set()} error={null} draft={null} fieldError={null} now={now}
    onToggle={noop} onDraftChange={noop} onSave={noop} onSync={noop} onTest={noop} onSetEnabled={noop} onDelete={noop} {...over} />
)

const meta: Meta = { title: 'Settings/Integrations/Issues' }
export default meta
export const Off: StoryObj = { render: () => view({ enabled: false, connections: null }) }
export const Member: StoryObj = { render: () => view({ isOwner: false, enabled: false, connections: null }) }
export const Healthy: StoryObj = { render: () => view({ polling: new Set(['c2']) }) }
export const Failed: StoryObj = { render: () => view({ connections: [conn({ state: 'failed', last_error: 'timeout', last_error_at: now - 600_000, last_success_at: now - 7_200_000 }), gitlab] }) }
export const StoppedTokenMissing: StoryObj = { render: () => view({ connections: [conn({ state: 'stopped', stopped_reason: 'token_missing', last_error: 'token_missing' })] }) }
export const Encrypted: StoryObj = { render: () => view({ encrypted: true, connections: [conn({ state: 'stopped', stopped_reason: 'encrypted_account' })] }) }
export const Offline: StoryObj = { render: () => view({ connected: false }) }
