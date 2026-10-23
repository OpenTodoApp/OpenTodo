import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useState } from 'react'
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

/**
 * The page after a few clicks (workspaces-settings-v2): each step waits for its
 * element, clicks it, and the story is marked pending until the last one is done.
 */
function Scripted({ steps }: { steps: string[] }) {
  const [pending, setPending] = useState(steps.length > 0)
  useEffect(() => {
    let live = true
    void (async () => {
      for (const step of steps) {
        // A step starting with "?" is optional: it is skipped when absent after a short wait.
        const optional = step.startsWith('?')
        const selector = optional ? step.slice(1) : step
        let el: HTMLElement | null = null
        for (let i = 0; i < (optional ? 10 : 100) && live && !(el = document.querySelector<HTMLElement>(selector)); i++) await new Promise((r) => setTimeout(r, 30))
        if (!live) return
        // Phone width shows the list alone: a step for the detail clicks the row first.
        el?.click()
        await new Promise((r) => setTimeout(r, 30))
      }
      if (live) setPending(false)
    })()
    return () => { live = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- one script per story
  return (
    <div className="max-w-4xl p-4">
      <WorkspacesSettings user={storyUser} />
      {pending && <span data-story-pending />}
    </div>
  )
}

/** The detail opens by itself from 768 px; at phone width the row is clicked first. */
const openFamily = '?[data-workspace-row="ws-family"]:not([aria-current])'
const tabNamed = (name: string) => `[data-workspace-detail] [role="tab"][id$="-tab-${name}"]`

/** Settings → Workspaces as the owner of Family: the list beside Family's General tab (name, colour, icon and the danger zone). */
export const SettingsOwner: StoryObj = {
  ...withSeed(() => seedDirectory('ws-family')),
  render: () => <Scripted steps={[]} />,
}

/** A member of Book club: General without the identity controls, and Leave. */
export const SettingsMember: StoryObj = {
  ...withSeed(() => seedDirectory('ws-club')),
  render: () => <Scripted steps={[]} />,
}

/** Family's Members tab: avatars, the role select and Remove, and Add by email. */
export const SettingsMembers: StoryObj = {
  ...withSeed(() => seedDirectory('ws-family')),
  render: () => <Scripted steps={[openFamily, tabNamed('members')]} />,
}

/** Family's Groups tab with "Adults" open: rename, the member picker, its members and Delete. */
export const SettingsGroupEditor: StoryObj = {
  ...withSeed(() => seedDirectory('ws-family')),
  render: () => <Scripted steps={[openFamily, tabNamed('groups'), '[data-group-row="g-adults"]']} />,
}

/** Family's Invites tab: the role and the expiry beside the optional email. */
export const SettingsInvites: StoryObj = {
  ...withSeed(() => seedDirectory('ws-family')),
  render: () => <Scripted steps={[openFamily, tabNamed('invites')]} />,
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
