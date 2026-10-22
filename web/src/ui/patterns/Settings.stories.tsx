import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Avatar } from '../Avatar'
import { Badge } from '../Card'
import { Button, IconButton } from '../Button'
import { Icon } from '../Icon'
import { Switch } from '../Switch'
import { ConfirmDialog } from './ConfirmDialog'
import { ListRow } from './ListRow'
import { Notice } from './Notice'
import { SettingRow, SettingsSection } from './SettingsSection'
import { SETTINGS_COPY } from '../../lib/settingsCopy'

// Card and row text comes from the settings copy table, as in the app (settings-copy D2).
// The two-factor card is the primary tier above a flat section (surfaces-v2 D9).
const MFA = SETTINGS_COPY.mfa
const TITLES = SETTINGS_COPY.notifications.rows.titles

function Section({ learnMore }: { learnMore?: string }) {
  const [on, setOn] = useState(true)
  return (
    <div className="space-y-4">
      <SettingsSection title={MFA.title} description={MFA.description} learnMore={learnMore} tier="primary">
        <SettingRow label={MFA.rows.status.label} status={<Badge hue="green">On · Authenticator app</Badge>} control={<Button size="sm">Manage</Button>} />
        <SettingRow label={MFA.rows.recovery.label} description={MFA.rows.recovery.description} status="7 of 10 left" control={<Button size="sm">View</Button>} />
        <SettingRow label={TITLES.label} description={TITLES.description} control={<Switch checked={on} onChange={setOn} label={TITLES.label} hideLabel />} />
      </SettingsSection>
      <SettingsSection title="Passkeys" level={2}>
        <ListRow leading={<Icon name="key-round" size="md" />} label="MacBook Touch ID" meta="Used yesterday" menu={<IconButton icon="ellipsis" label="Passkey actions" size="sm" />} />
        <ListRow leading={<Avatar id="u-sam" name="Sam Rivera" size="md" />} label="Sam Rivera with a very long display name that has to wrap on a phone screen" meta="sam@example.com"
          badges={<><Badge hue="indigo">Admin</Badge><Badge hue="yellow">Invited</Badge><Badge hue="slate">2FA off</Badge></>}
          menu={<IconButton icon="ellipsis" label="Member actions" size="sm" />} />
      </SettingsSection>
    </div>
  )
}

function Confirm() {
  const [open, setOpen] = useState(true)
  return (
    <>
      <Button variant="danger" icon="trash-2" onClick={() => setOpen(true)}>Delete label</Button>
      {open && <ConfirmDialog title="Delete “errands”?" consequence="3 open tasks lose this label. You can't undo this." confirmLabel="Delete label" onConfirm={() => {}} onCancel={() => setOpen(false)} />}
    </>
  )
}

const meta: Meta = { title: 'UI/Patterns/Settings' }
export default meta
export const SectionAndRows: StoryObj = { render: () => <Section /> }
/** The card's one line ending with Learn more, which opens the card's guide section beside the page. */
export const LearnMore: StoryObj = { render: () => <Section learnMore={MFA.learnMore} /> }
export const ConfirmDanger: StoryObj = { render: () => <Confirm /> }
export const Notices: StoryObj = {
  render: () => (
    <div className="max-w-xl space-y-2">
      <Notice>You are offline. These settings need a connection to your server.</Notice>
      <Notice tone="success">Password changed. Your other sessions were signed out.</Notice>
      <Notice tone="warning">Only 2 recovery codes left. Generate a new set and store it safely.</Notice>
      <Notice tone="danger">Your current password is not correct.</Notice>
    </div>
  ),
}
