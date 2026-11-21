import type { Meta, StoryObj } from '@storybook/react-vite'
import { useWorkspaceState } from '../lib/localData'
import WorkspaceActivity from './WorkspaceActivity'
import { seedBase, seedProjectWithSections, withSeed } from './stories/fixtures'

// Screen: a workspace's Activity (`/workspaces/<id>/activity`, OpenSpec change
// workspace-activity), opened from the workspace menu.
const meta: Meta = { title: 'Screens/Workspace activity' }
export default meta

function Current() {
  const state = useWorkspaceState()
  return <div className="-m-4 h-[48rem] overflow-y-auto bg-canvas"><WorkspaceActivity id={state.current || 'personal'} /></div>
}

/** Every change in the workspace, newest first, by day. */
export const Events: StoryObj = {
  ...withSeed(() => seedProjectWithSections(false)),
  render: () => <Current />,
}

/** Nothing on this device yet. */
export const Empty: StoryObj = {
  ...withSeed(seedBase),
  render: () => <Current />,
}
