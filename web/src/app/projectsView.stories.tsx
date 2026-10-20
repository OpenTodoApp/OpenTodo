import type { Meta, StoryObj } from '@storybook/react-vite'
import { archiveProject, createProject, createTask } from '../lib/ops'
import type { ArchivedProject } from '../lib/archive'
import type { Project } from '../lib/types'
import { ArchivedProjectsList } from './ArchivedProjects'
import { ProjectsView } from './ProjectsView'
import { HEX, seedInbox, seeded, withClock, withSeed } from './stories/fixtures'

// The All projects page (OpenSpec change sidebar-favourites, design D6): the page
// template with the whole tree, the find field and the archived projects disclosure.
const meta: Meta = { title: 'Screens/All projects' }
export default meta

async function seedProjects() {
  await seedInbox()
  const garden = await createProject({ name: 'Garden', color: HEX.green, parent_id: seeded.home })
  await createTask({ title: 'Prune the roses', project_id: garden })
  await archiveProject(garden)
  await archiveProject(await createProject({ name: 'Trip 2026', color: HEX.blue }))
}

/** The tree with counts and the archived projects folded at the bottom. */
export const Default: StoryObj = { ...withSeed(seedProjects), render: () => <ProjectsView /> }

/** Opened from Settings → Data (`/projects#archived`): the disclosure is open. */
export const ArchivedOpen: StoryObj = { ...withSeed(seedProjects), render: () => <ProjectsView archived /> }

const project = (id: string, name: string, color: string) => ({ id, name, color, archived: true } as Project)
const rows: ArchivedProject[] = [
  { project: project('a', 'Garden', '#22c55e'), parentName: 'Home', open: 2, canRestore: true },
  { project: project('b', 'Trip 2026 with a rather long name that wraps on phones', '#3b82f6'), parentName: null, open: 1, canRestore: true },
  { project: project('c', 'Shared launch', '#8b5cf6'), parentName: null, open: 0, canRestore: false },
] as never

/** The archived list on its own: parent, open tasks, and a restore the user may not make. */
export const ArchivedList: StoryObj = { decorators: [withClock], render: () => <div className="max-w-xl p-4"><ArchivedProjectsList rows={rows} onRestore={() => {}} bare /></div> }

/** Nothing archived: the list says so. */
export const ArchivedEmpty: StoryObj = { decorators: [withClock], render: () => <div className="max-w-xl p-4"><ArchivedProjectsList rows={[]} onRestore={() => {}} bare /></div> }
