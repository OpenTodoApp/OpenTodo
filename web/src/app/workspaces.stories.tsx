import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Membership } from '../lib/types'
import { storeWorkspaces, switchTo } from '../lib/workspaces'
import { seedInbox, storyUser, withSeed } from './stories/fixtures'
import { ShareDirectory } from './ShareDirectory'
import { WorkspacesSettings } from './WorkspacesSettings'

// Workspaces (OpenSpec change workspaces, tasks 6.4 and 7.5): Settings →
// Workspaces for an owner and a member, and the share dialog's directory with
// groups, over a seeded database with two workspaces.
const me = { userId: storyUser.id, name: storyUser.name, role: 'owner' as const }

async function seedDirectory(current: 'ws-family' | 'ws-club'): Promise<void> {
  await seedInbox()
  await storeWorkspaces([
    { id: 'ws-personal', name: 'Personal', icon: '', color: '', default: true, role: 'owner', ownerId: storyUser.id, members: [me], groups: [] },
    { id: 'ws-family', name: 'Family', icon: 'house', color: '#22c55e', default: false, role: 'owner', ownerId: storyUser.id,
      members: [me, { userId: 'u-bob', name: 'Bob Okafor', role: 'admin' }, { userId: 'u-chen', name: 'Chen Wei', role: 'member' }],
      groups: [{ id: 'g-adults', name: 'Adults', members: [storyUser.id, 'u-bob'] }, { id: 'g-kids', name: 'Kids', members: ['u-chen'] }] },
    { id: 'ws-club', name: 'Book club', icon: '', color: '#8b5cf6', default: false, role: 'member', ownerId: 'u-mara',
      members: [{ userId: 'u-mara', name: 'Mara Lind', role: 'owner' }, { ...me, role: 'member' }], groups: [] },
  ])
  await switchTo(current)
}

const meta: Meta = { title: 'Screens/Workspaces' }
export default meta

/** Settings → Workspaces as the owner of Family: name and colour, members, groups, invite links and the danger zone. */
export const SettingsOwner: StoryObj = {
  ...withSeed(() => seedDirectory('ws-family')),
  render: () => <div className="max-w-2xl p-4"><WorkspacesSettings user={storyUser} /></div>,
}

/** A member of Book club: the lists without controls and Leave. */
export const SettingsMember: StoryObj = {
  ...withSeed(() => seedDirectory('ws-club')),
  render: () => <div className="max-w-2xl p-4"><WorkspacesSettings user={storyUser} /></div>,
}

const membership: Membership = {
  projectId: 'p-house', role: 'owner', ownerId: storyUser.id,
  members: [{ userId: storyUser.id, name: storyUser.name, email: storyUser.email, role: 'owner' }, { userId: 'u-bob', name: 'Bob Okafor', email: 'bob@example.com', role: 'editor', via: [{ id: 'g-adults', name: 'Adults' }] }],
  grants: [{ groupId: 'g-adults', name: 'Adults', role: 'editor' }],
}

/** The share dialog's directory in Family: people by name, no email field, and the groups with their role on the project. */
export const ShareDirectoryAndGroups: StoryObj = {
  ...withSeed(() => seedDirectory('ws-family')),
  render: () => (
    <div className="max-w-md rounded-card border border-default bg-surface p-4">
      <ShareDirectory projectId="p-house" workspace={{ id: 'ws-family', name: 'Family', icon: 'house', color: '#22c55e', default: false, role: 'owner', ownerId: storyUser.id }}
        membership={membership} roles={['viewer', 'editor', 'admin']} busy={false} run={() => {}} />
    </div>
  ),
}
