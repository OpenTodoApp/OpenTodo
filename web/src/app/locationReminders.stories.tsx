// location-reminders (D4, D5): the task panel's radius form and Settings →
// Notifications → Location reminders in each state. Checked in light and dark by
// the a11y and visual gates, at 375 px (a phone) and 1280 px. The menu's At a place
// group is covered by locationReminders.test.tsx (menus are checked in UI/Menu).
import type { Meta, StoryObj } from '@storybook/react-vite'
import { LocationReminderEditor } from './LocationReminderEditor'
import { LocationRemindersView, type LocationRemindersState } from './LocationRemindersSettings'

const noop = () => {}
const meta: Meta = { title: 'Screens/Location reminders' }
export default meta

const settings = (state: LocationRemindersState | null, extra: Partial<Parameters<typeof LocationRemindersView>[0]> = {}) => (
  <LocationRemindersView mode="shell" platform="android" state={state} disclosing={false} busy={false} onToggle={noop} onContinue={noop} onCancel={noop} {...extra} />
)

/** "When I leave" Home, 300 m, in the task panel. */
export const RadiusForm: StoryObj = {
  render: () => (
    <div className="max-w-md">
      <LocationReminderEditor kind="leave" place="Home" point={{ lat: 45.4781, lon: 9.2272 }} initial={undefined} onSave={noop} onCancel={noop} />
    </div>
  ),
}

export const SettingsOff: StoryObj = { render: () => settings({ enabled: false, permission: null }) }
export const SettingsDisclosure: StoryObj = { render: () => settings({ enabled: false, permission: null }, { disclosing: true }) }
export const SettingsOn: StoryObj = { render: () => settings({ enabled: true, permission: 'granted' }) }
export const SettingsForegroundOnly: StoryObj = { render: () => settings({ enabled: false, permission: 'foreground-only' }) }
export const SettingsBrowser: StoryObj = { render: () => settings(null, { mode: 'browser' }) }
