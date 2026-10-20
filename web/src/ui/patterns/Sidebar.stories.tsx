import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Icon } from '../Icon'
import { Avatar } from '../Avatar'
import { SidebarGroup, SidebarGroupAction, SidebarItem, StatusDot } from './Sidebar'

const meta: Meta = { title: 'UI/Patterns/Sidebar' }
export default meta

const Dot = ({ hue }: { hue: string }) => <span className="inline-block h-2.5 w-2.5 rounded-full bg-hue-solid" data-hue={hue} />
const Unread = ({ n }: { n: number }) => <span className="rounded-full bg-accent px-1.5 text-hint font-semibold leading-4 text-on-accent">{n}</span>

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="flex h-[32rem] w-64 flex-col border-r border-default bg-canvas">{children}</div>
}

/** The whole structure: pinned top, a scrolling middle with sticky group headings, a pinned footer; Filters folded with its count. */
export const Structure: StoryObj = {
  render: function StructureStory() {
    const [labelsOpen, setLabelsOpen] = useState(true)
    const [filtersOpen, setFiltersOpen] = useState(false)
    return (
      <Frame>
        <div className="shrink-0 px-3 pt-3">
          <div className="mb-4 flex items-center gap-2 px-1 font-semibold"><Icon name="circle-check-big" className="text-accent" />OpenTodo</div>
          <nav className="space-y-0.5" aria-label="Primary">
            <SidebarItem icon="inbox" label="Inbox" count={6} active />
            <SidebarItem icon="calendar-check" label="Today" count={10} />
            <SidebarItem icon="calendar-days" label="Upcoming" />
            <SidebarItem icon="calendar-range" label="Calendar" />
            <SidebarItem icon="ellipsis" label="More" badge={<StatusDot label="Review due · last weekly review 9 days ago" />} />
          </nav>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2" data-sidebar-scroll>
          <SidebarGroup title="Filters" collapsible open={filtersOpen} onToggle={() => setFiltersOpen((v) => !v)} count={2} actions={<SidebarGroupAction>All</SidebarGroupAction>}>
            <SidebarItem icon="filter" label="Waiting for" count={2} countMode="hidden" countLabel="2 open tasks" />
            <SidebarItem icon="filter" label="Deep work" count={4} countMode="hidden" countLabel="4 open tasks" />
          </SidebarGroup>
          <SidebarGroup title="Projects" collapsible count={12} actions={<><SidebarGroupAction aria-label="Find in the sidebar"><Icon name="search" size="xs" /></SidebarGroupAction><SidebarGroupAction aria-label="New project"><Icon name="plus" size="xs" /></SidebarGroupAction></>}>
            {['Work', 'Website launch', 'Design system', 'Hiring Q4', 'Home', 'Kitchen renovation', 'Health', 'Learning', 'Side project', 'Travel 2027', 'Finance', 'Reading list'].map((p, i) => (
              <div key={p} style={{ paddingLeft: `${[0, 1, 2, 1, 0, 1, 0, 0, 0, 0, 0, 0][i] * 0.75}rem` }}>
                <SidebarItem leading={<Dot hue={['blue', 'violet', 'pink', 'teal', 'green', 'orange', 'red', 'indigo', 'green', 'cyan', 'slate', 'orange'][i]} />} label={p}
                  count={[0, 12, 3, 3, 2, 6, 3, 3, 4, 2, 3, 4][i]} countMode="hover" countLabel={`${[0, 12, 3, 3, 2, 6, 3, 3, 4, 2, 3, 4][i]} open tasks`} badge={i === 1 ? <Unread n={3} /> : undefined} />
              </div>
            ))}
          </SidebarGroup>
          <SidebarGroup title="Labels" collapsible open={labelsOpen} onToggle={() => setLabelsOpen((v) => !v)} actions={<><SidebarGroupAction>All</SidebarGroupAction><SidebarGroupAction aria-label="New label"><Icon name="plus" size="xs" /></SidebarGroupAction></>}>
            {['work', 'home', 'errand', 'waiting', 'deep-work'].map((l, i) => <SidebarItem key={l} leading={<Dot hue={['blue', 'green', 'yellow', 'slate', 'violet'][i]} />} label={l} count={[5, 2, 1, 2, 3][i]} countMode="hidden" countLabel={`${[5, 2, 1, 2, 3][i]} open tasks`} />)}
          </SidebarGroup>
        </div>
        <div className="shrink-0 px-3 pb-3 pt-2" data-sidebar-footer>
          <SidebarItem leading={<Avatar id="u-raffaele" name="Raffaele" />} label="Raffaele" />
        </div>
      </Frame>
    )
  },
}

/** Item states: idle, active, with a badge, with a long label. */
export const Items: StoryObj = {
  render: () => (
    <div className="w-64 space-y-0.5 bg-canvas p-3">
      <SidebarItem icon="inbox" label="Inbox" count={6} />
      <SidebarItem icon="calendar-check" label="Today" count={10} active />
      <SidebarItem leading={<Dot hue="violet" />} label="Website launch" count={12} badge={<Unread n={3} />} />
      <SidebarItem leading={<Dot hue="teal" />} label="A project with a very long name that truncates in the sidebar" count={3} badge={<Icon name="users" size={14} className="text-faint" />} />
      <SidebarItem icon="archive" label="Someday" />
    </div>
  ),
}

/** Count modes (quiet-sidebar D1): always (Inbox), on hover or focus (a project), for assistive technology only (a filter, a label); and a state dot. */
export const CountModes: StoryObj = {
  render: () => (
    <div className="w-64 space-y-0.5 bg-canvas p-3">
      <SidebarItem icon="inbox" label="Inbox" count={6} countLabel="6 open tasks" />
      <SidebarItem leading={<Dot hue="violet" />} label="Website launch (hover)" count={5} countMode="hover" countLabel="5 open tasks" />
      <SidebarItem leading={<Dot hue="violet" />} label="Website launch (focused)" count={5} countMode="hover" countLabel="5 open tasks" autoFocus />
      <SidebarItem icon="filter" label="Waiting (hidden)" count={2} countMode="hidden" countLabel="2 open tasks" />
      <SidebarItem icon="clipboard-check" label="Review" badge={<StatusDot label="Review due · last weekly review 9 days ago" />} />
    </div>
  ),
}
