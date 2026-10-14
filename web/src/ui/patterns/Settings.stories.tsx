import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Avatar } from '../Avatar'
import { Badge } from '../Card'
import { Button, IconButton } from '../Button'
import { Icon } from '../Icon'
import { Switch } from '../Switch'
import { ConfirmDialog } from './ConfirmDialog'
import { ListRow } from './ListRow'
import { SettingRow, SettingsSection } from './SettingsSection'

function Section() {
  const [on, setOn] = useState(true)
  return (
    <div className="space-y-4">
      <SettingsSection title="Two-factor authentication" description="A code from your phone after your password.">
        <SettingRow label="Status" status={<Badge hue="green">On · Authenticator app</Badge>} control={<Button size="sm">Manage</Button>} />
        <SettingRow label="Recovery codes" description="Use one if you lose your phone." status="7 of 10 left" control={<Button size="sm">View</Button>} />
        <SettingRow label="Include task titles" description="Applies immediately on this device." control={<Switch checked={on} onChange={setOn} label="Include task titles" hideLabel />} />
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
export const ConfirmDanger: StoryObj = { render: () => <Confirm /> }
