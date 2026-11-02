import type { Meta, StoryObj } from '@storybook/react-vite'
import { createProject, updateProject } from '../../lib/ops'
import { seeded, withSeed } from '../stories/fixtures'
import { ListModeStep } from './ListModeStep'

// The project menu's "List…" step (OpenSpec reusable-lists, design D7): the
// Reusable list and Sort into aisles switches, as the menu's overlay shows them.
// Use the toolbar's theme switch (or side by side) for light and dark.
const meta: Meta = { title: 'Screens/Project menu/List', parameters: { layout: 'padded' } }
export default meta

async function groceries(on: boolean) {
  seeded.groceries = await createProject({ name: 'Groceries' })
  if (on) await updateProject(seeded.groceries, { reusable: true, aisles: true })
}

const frame = (canEdit: boolean) => (
  <div className="w-80 rounded-surface border border-default bg-surface p-1 shadow-2"><ListModeStep projectId={seeded.groceries} canEdit={canEdit} /></div>
)

/** An ordinary project: only the Reusable list switch. */
export const Off: StoryObj = { ...withSeed(() => groceries(false)), render: () => frame(true) }

/** A reusable list sorting into aisles. */
export const On: StoryObj = { ...withSeed(() => groceries(true)), render: () => frame(true) }

/** A viewer of a shared reusable list: the switches are shown and disabled. */
export const Viewer: StoryObj = { ...withSeed(() => groceries(true)), render: () => frame(false) }
