import type { Meta, StoryObj } from '@storybook/react-vite'
import type { User } from '../lib/types'
import { ProfileCard, SettingsView } from './SettingsView'

const member: User = { id: 'u-sam', email: 'sam@example.com', name: 'Sam Rivera', role: 'member', createdAt: 1 }
const owner: User = { id: 'u-ada', email: 'ada@example.com', name: 'Ada Lovelace', role: 'owner', createdAt: 1 }
const long: User = { id: 'u-long', email: 'a.very.long.email.address.for.testing@subdomain.example.com', name: 'Maximilian Alexander von Habsburg-Lothringen', role: 'admin', createdAt: 1 }

const meta: Meta = { title: 'Settings/Navigation' }
export default meta
export const Profile: StoryObj = {
  render: () => <div className="max-w-md space-y-3"><ProfileCard user={owner} /><ProfileCard user={member} /><ProfileCard user={long} /></div>,
}
export const OverviewMember: StoryObj = { render: () => <SettingsView user={member} onLogout={() => {}} /> }
export const SectionPage: StoryObj = { render: () => <SettingsView user={member} onLogout={() => {}} section="preferences" /> }
