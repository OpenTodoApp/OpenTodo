import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { createField } from '../lib/fields'
import { useProjects } from '../lib/localData'
import type { Project } from '../lib/types'
import { FieldsDialog } from './FieldsDialog'
import { seedProjectWithSections, seeded, withSeed } from './stories/fixtures'
import { DuplicateProjectDialog } from './TemplateDialogs'

// Rare overlays (OpenSpec change screen-stories-rare, design D2): the project
// menu's Fields… and Duplicate… dialogs on the seeded Website launch project.
const meta: Meta = { title: 'Screens/Project dialogs' }
export default meta

const noop = () => {}

/** The seeded project once the local database has it. */
function WithProject({ children }: { children: (p: Project) => ReactNode }) {
  const p = useProjects().find((x) => x.id === seeded.website)
  return p ? <>{children(p)}</> : <span data-story-pending />
}

/** Fields: three definitions of different types, one with choices. */
export const Fields: StoryObj = {
  ...withSeed(async () => {
    await seedProjectWithSections(false)
    await createField(seeded.website, { name: 'Owner', type: 'text' })
    await createField(seeded.website, { name: 'Effort', type: 'choice', options: 'S\nM\nL' })
    await createField(seeded.website, { name: 'Launch date', type: 'date' })
  }),
  render: () => <WithProject>{(p) => <FieldsDialog project={p} onClose={noop} />}</WithProject>,
}

/** Duplicate project: the copy's name and what it keeps. */
export const DuplicateProject: StoryObj = {
  ...withSeed(() => seedProjectWithSections(false)),
  render: () => <WithProject>{(p) => <DuplicateProjectDialog project={p} shared={false} onClose={noop} />}</WithProject>,
}
