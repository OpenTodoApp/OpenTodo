import type { Meta, StoryObj } from '@storybook/react-vite'
import { ProjectInvitePolicyView } from './ProjectInvitePolicyPanel'

const noop = () => {}

const meta: Meta = { title: 'Settings/Access policies' }
export default meta
export const ProjectInvitesOn: StoryObj = { render: () => <ProjectInvitePolicyView value busy={false} error={null} onChange={noop} /> }
export const ProjectInvitesOff: StoryObj = { render: () => <ProjectInvitePolicyView value={false} busy={false} error={null} onChange={noop} /> }
export const ProjectInvitesOffline: StoryObj = { render: () => <ProjectInvitePolicyView value={null} busy={false} error={null} onChange={noop} /> }
export const ProjectInvitesError: StoryObj = { render: () => <ProjectInvitePolicyView value busy={false} error="The server is unreachable." onChange={noop} /> }
