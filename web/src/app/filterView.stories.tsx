import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { FilterView } from './FilterView'
import { ConditionEditor } from './filter/ConditionEditor'
import { label, project, seedInbox, withSeed } from './stories/fixtures'

// Core screen: Filter (`/filter`), a query and its results (OpenSpec change
// ux-audit-three-widths task 5.2; weekly in the inventory, as is a saved filter).
const meta: Meta = { title: 'Screens/Filter', ...withSeed(seedInbox) }
export default meta

function Column({ children }: { children: ReactNode }) {
  return <div className="-m-4 h-[48rem] overflow-y-auto bg-canvas">{children}</div>
}

/** A query with results. */
export const WithResults: StoryObj = {
  render: () => <Column><FilterView initialQuery="@errand | p2" /></Column>,
}

/** A valid query that matches nothing. */
export const NoResults: StoryObj = {
  render: () => <Column><FilterView initialQuery="@nothing-has-this" /></Column>,
}

/** A query the parser rejects, with its message. */
export const InvalidQuery: StoryObj = {
  render: () => <Column><FilterView initialQuery="due <= (" /></Column>,
}

// ---- the visual builder (OpenSpec change filter-builder) ----

/** No query yet: an empty builder above the formula and the usage hint. */
export const BuilderEmpty: StoryObj = {
  render: () => <Column><FilterView /></Column>,
}

/** Groups, Not on a condition and on a group, and the count. */
export const BuilderNested: StoryObj = {
  render: () => <Column><FilterView initialQuery="#Work & (@errand | due <= tomorrow) & !@waiting & !(p3 | p4)" /></Column>,
}

/** A query the builder cannot show stays editable as text, with a notice. */
export const BuilderUnsupported: StoryObj = {
  render: () => <Column><FilterView initialQuery="!!p1" /></Column>,
}

const LABELS = [label('l1', 'errand', '#f97316'), label('l2', 'deep-work', '#8b5cf6'), label('l3', 'waiting', '#64748b')]
const PROJECTS = [project({ id: 'p1', name: 'Work', color: '#3b82f6' }), project({ id: 'p2', name: 'Home', color: '#22c55e' })]

/** The condition dialog editing a date comparison, with Not set. */
export const ConditionDialog: StoryObj = {
  render: () => (
    <ConditionEditor leaf={{ kind: 'date', field: 'due', op: '<=', date: { type: 'period', unit: 'week', offset: 0 } }} not
      labels={LABELS} projects={PROJECTS} fields={[]} onSave={() => {}} onRemove={() => {}} onClose={() => {}} />
  ),
}
