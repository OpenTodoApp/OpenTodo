import type { Meta, StoryObj } from '@storybook/react-vite'
import type { User } from '../lib/types'
import { ProfileCard, SettingsView } from './SettingsView'
import { withClock } from './stories/fixtures'

const member: User = { id: 'u-sam', email: 'sam@example.com', name: 'Sam Rivera', role: 'member', createdAt: 1 }
const owner: User = { id: 'u-ada', email: 'ada@example.com', name: 'Ada Lovelace', role: 'owner', createdAt: 1 }
const long: User = { id: 'u-long', email: 'a.very.long.email.address.for.testing@subdomain.example.com', name: 'Maximilian Alexander von Habsburg-Lothringen', role: 'admin', createdAt: 1 }

const meta: Meta = { title: 'Settings/Navigation' }
export default meta
export const Profile: StoryObj = {
  render: () => <div className="max-w-md space-y-3"><ProfileCard user={owner} /><ProfileCard user={member} /><ProfileCard user={long} /></div>,
}
export const OverviewMember: StoryObj = { render: () => <SettingsView user={member} onLogout={() => {}} /> }
// Preferences shows today's date in the Date and time panel; a fixed clock keeps the baseline stable.
function fixedClock(at: number) {
  const Real = Date
  class Fixed extends Real {
    constructor(...args: unknown[]) {
      if (args.length) super(...(args as [number]))
      else super(at)
    }
    static now() { return at }
  }
  globalThis.Date = Fixed as DateConstructor
  return () => { globalThis.Date = Real }
}
export const SectionPage: StoryObj = {
  beforeEach: () => fixedClock(new Date(2026, 9, 14, 12).getTime()),
  render: () => <SettingsView user={member} onLogout={() => {}} section="general" />,
}
export const AppearancePage: StoryObj = { render: () => <SettingsView user={member} onLogout={() => {}} section="appearance" /> }
/** About (screen-stories-rare D1): the version, the licence and the links; the server's answers are stubbed. */
export const AboutPage: StoryObj = { decorators: [withClock], render: () => <SettingsView user={member} onLogout={() => {}} section="about" /> }
