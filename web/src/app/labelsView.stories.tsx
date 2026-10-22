import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { LabelsView } from './LabelsView'
import { seedInbox, withSeed } from './stories/fixtures'

// Core screen: the Labels page (OpenSpec change ux-audit-three-widths task 5.1; weekly
// in the inventory). One label's tasks are Screens/Label view.
const meta: Meta = { title: 'Screens/Labels', ...withSeed(seedInbox) }
export default meta

function Column({ children }: { children: ReactNode }) {
  return <div className="-m-4 h-[48rem] overflow-y-auto bg-canvas">{children}</div>
}

/** Every label with its colour and count, its menu on each row. */
export const AllLabels: StoryObj = {
  render: () => <Column><LabelsView route={{ view: 'labels' }} /></Column>,
}
