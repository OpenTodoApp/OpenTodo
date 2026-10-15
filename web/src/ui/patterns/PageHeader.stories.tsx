import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from '../Button'
import { Icon } from '../Icon'
import { MenuItem, MenuSeparator } from '../Menu'
import { PageBody, PageHeader } from './PageHeader'

const meta: Meta = { title: 'UI/Patterns/Page template' }
export default meta

const rows = (n: number) => (
  <ul className="space-y-1">
    {Array.from({ length: n }, (_, i) => (
      <li key={i} className="flex min-h-(--size-row) items-center gap-2 rounded-control px-2 hover:bg-sunken">
        <span className="h-5 w-4" /><span className="h-5 w-5 rounded-full border-2 border-p4" /><span className="text-body">Task {i + 1}</span>
      </li>
    ))}
  </ul>
)

/** A list page: 48 rem, title, meta, one action, the overflow and Help. */
export const ListPage: StoryObj = {
  render: () => (
    <div className="h-[32rem] overflow-y-auto bg-canvas">
      <PageBody width="list">
        <PageHeader title="Today" meta="Thursday, 15 Oct" help="today" actions={<Button variant="ghost" size="sm" icon="filter">Filter</Button>}
          overflow={<><MenuItem label="Select tasks" icon="check" onSelect={() => {}} /><MenuSeparator /><MenuItem label="Show completed" icon="circle-check-big" onSelect={() => {}} /></>} />
        {rows(18)}
      </PageBody>
    </div>
  ),
}

/** A project page: a colour before the title, two actions, a second row with a segmented control. */
export const ProjectPage: StoryObj = {
  render: () => (
    <div className="h-[32rem] overflow-y-auto bg-canvas">
      <PageBody width="list">
        <PageHeader title="Website launch" leading={<span className="h-3 w-3 rounded-full bg-hue-solid" data-hue="violet" />} help="projects"
          actions={<><Button variant="ghost" size="sm" icon="users">Share</Button><Button variant="ghost" size="sm" icon="filter">Filter</Button></>}
          overflow={<><MenuItem label="Rename" icon="pencil" onSelect={() => {}} /><MenuItem label="Move to…" icon="folder" onSelect={() => {}} /><MenuItem label="Project activity" icon="history" onSelect={() => {}} /><MenuSeparator /><MenuItem label="Archive project" icon="archive" danger onSelect={() => {}} /></>}>
          <div role="group" aria-label="Project layout" className="inline-flex rounded-control border border-default p-0.5 text-body">
            <button type="button" aria-pressed className="rounded-control bg-sunken px-2.5 py-1 font-medium">List</button>
            <button type="button" className="px-2.5 py-1 text-muted">Board</button>
          </div>
        </PageHeader>
        {rows(12)}
      </PageBody>
    </div>
  ),
}

/** A settings or form page: 42 rem with a back action, as a nested page shows it below 1024 px. */
export const FormPage: StoryObj = {
  render: () => (
    <div className="h-[24rem] overflow-y-auto bg-canvas">
      <PageBody width="form">
        <PageHeader title="General" back={{ label: 'Settings', onClick: () => {} }} help="settings/general" />
        <div className="rounded-card border border-default bg-surface p-6 shadow-1 text-body text-muted">Sections and rows go here.</div>
      </PageBody>
    </div>
  ),
}

/** A full-width page (board, calendar): the header keeps the column's padding, the content takes the width. */
export const FullWidthPage: StoryObj = {
  render: () => (
    <div className="h-[20rem] overflow-y-auto bg-canvas">
      <PageBody width="full">
        <PageHeader title="Oct 11 – Oct 17" actions={<><Button variant="ghost" size="sm">Today</Button><Button variant="ghost" size="sm" icon="chevron-left" aria-label="Previous week" /><Button variant="ghost" size="sm" icon="chevron-right" aria-label="Next week" /></>} help="calendar" />
        <div className="flex gap-3 overflow-x-auto" data-scroll-x>
          {['Backlog', 'In progress', 'Review', 'Done'].map((c) => (
            <div key={c} className="w-72 shrink-0 rounded-card bg-sunken p-2 text-body"><span className="font-semibold">{c}</span><div className="mt-2 h-24 rounded-control border border-default bg-surface" /></div>
          ))}
        </div>
      </PageBody>
    </div>
  ),
}

/** A long title with every option on a phone frame. */
export const LongTitle: StoryObj = {
  render: () => (
    <PageBody width="list">
      <PageHeader title="A project with a name long enough to be truncated on a phone screen and even on a laptop" leading={<Icon name="folder" className="text-muted" />}
        meta="12 open" help="projects" actions={<Button variant="ghost" size="sm" icon="filter" aria-label="Filter" />} overflow={<MenuItem label="Rename" onSelect={() => {}} />} />
    </PageBody>
  ),
}
