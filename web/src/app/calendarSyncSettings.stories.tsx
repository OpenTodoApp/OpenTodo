import type { Meta, StoryObj } from '@storybook/react-vite'
import type { CalendarConnection, MicrosoftClientSetting } from '../lib/types'
import { CalendarSyncView, type CalendarSyncViewProps } from './CalendarSyncPanel'

// Settings → Integrations → Calendar sync with Microsoft (OpenSpec change
// outlook-calendar-sync, task 5.1): the three ways to connect, an Outlook card,
// and the owner's Microsoft client, at 360 and 1280 px.

const noop = () => {}
const done = async () => {}
const now = 1_760_000_060_000

const outlook: CalendarConnection = {
  id: 'c1', provider: 'microsoft', name: 'Outlook', server_url: 'https://graph.microsoft.com/v1.0', username: 'ada@outlook.com',
  calendars: [{ url: 'AAMk-cal', name: 'Calendar', color: '#3366cc', time_zone: 'Europe/Berlin', read_only: false },
    { url: 'AAMk-hol', name: 'Holidays', color: '#00aa55', time_zone: 'Europe/Berlin', read_only: true }],
  target: 'AAMk-cal', read: ['AAMk-hol'], include_date_only: false, enabled: true, state: 'ok', next_sync_at: now + 300_000,
  last_sync_at: now - 120_000, last_success_at: now - 120_000, last_error: '', last_error_at: null, stopped_reason: '',
  last_run: { moved: 1, renamed: 0, unscheduled: 0, written: 4, removed: 0, conflicts: 0, refused: 0, partial: false },
  password_set: true, event_count: 18, created_at: now - 86_400_000, updated_at: now - 120_000,
}
const refused: CalendarConnection = { ...outlook, id: 'c2', name: 'Work', username: 'ada@contoso.com', state: 'stopped', stopped_reason: 'microsoft_client_refused' }
const client: MicrosoftClientSetting = { client_id: '11111111-2222-3333-4444-555555555555', tenant: 'common', secret_set: true, from_env: false,
  redirect_uri: 'https://todo.example/api/v1/calendar-sync/microsoft/callback', refused_at: null }

const view = (over: Partial<CalendarSyncViewProps> = {}) => (
  <CalendarSyncView isOwner enabled google microsoft maxConnections={3} googleClient={{ client_id: 'g', secret_set: true, from_env: false, redirect_uri: 'x' }}
    microsoftClient={client} connected encrypted={false} connections={[outlook]} busy={false} syncing={new Set()} error={null} notice={null} now={now}
    onToggle={noop} onSaveGoogleClient={done} onSaveMicrosoftClient={done} onCreateCalDAV={async () => null} onConnectGoogle={noop} onConnectMicrosoft={noop}
    onPatch={done} onSync={noop} onDelete={noop} {...over} />
)
const narrow = (over: Partial<CalendarSyncViewProps> = {}) => <div className="w-[360px]">{view(over)}</div>
const wide = (over: Partial<CalendarSyncViewProps> = {}) => <div className="w-[1280px]">{view(over)}</div>

const meta: Meta = { title: 'Settings/Integrations/Calendar sync' }
export default meta
export const Phone: StoryObj = { render: () => narrow() }
export const Desktop: StoryObj = { render: () => wide() }
export const MemberWithoutMicrosoft: StoryObj = { render: () => narrow({ isOwner: false, microsoft: false, microsoftClient: null }) }
export const SecretRefused: StoryObj = { render: () => wide({ microsoftClient: { ...client, refused_at: now - 3_600_000 }, connections: [outlook, refused] }) }
export const TimesInUTC: StoryObj = { render: () => narrow({ connections: [{ ...outlook, calendars: outlook.calendars.map((c) => ({ ...c, time_zone: undefined })) }] }) }
