import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ReactNode, useEffect, useRef } from 'react'
import { Sidebar } from './Sidebar'
import { seedInbox, seeded, storyUser, withSeed } from './stories/fixtures'

// Core screen: the sidebar (OpenSpec change ux-overhaul, task 8.7; app-shell
// "Sidebar structure", "Resizable sidebar", "No desktop top bar"). The real
// component over a seeded database: Inbox, Today, Upcoming and Calendar on top, the
// More group, then the scrolling filters, projects (one nested) and labels, and the
// pinned footer. The clock is frozen, so the counts never move.
const meta: Meta = { title: 'Screens/Sidebar', ...withSeed(seedInbox) }
export default meta

const noop = () => {}

/** The shell's sidebar column from 768 px: 16 rem wide, full height (tall enough here to show every group without scrolling). */
function Column({ children, width = 'w-64' }: { children: ReactNode; width?: string }) {
  return <div className={`flex h-[52rem] ${width} flex-col border-r border-default bg-canvas`}>{children}</div>
}

/** The Inbox open: the primary destinations with their counts, projects and labels. */
export const Default: StoryObj = {
  render: () => (
    <Column><Sidebar route={{ view: 'inbox' }} user={storyUser} onSearch={noop} onShortcuts={noop} onToggleCollapse={noop} /></Column>
  ),
}

/** A nested project selected: its row is current and its parent is expanded. */
export const ProjectSelected: StoryObj = {
  render: () => (
    <Column><Sidebar route={{ view: 'project', id: seeded.website }} user={storyUser} onSearch={noop} onShortcuts={noop} onToggleCollapse={noop} /></Column>
  ),
}

/** Filters folded on this device (the key is set for this story only) and the scroller pulled down, so the Projects heading is stuck at the top. */
function FoldedScrolled() {
  const column = useRef<HTMLDivElement>(null)
  // Device state the sidebar reads at mount; removed again so the other stories start clean.
  try { localStorage.setItem('ot.sidebar.group.filters', '0') } catch { /* story only */ }
  useEffect(() => {
    const scroller = column.current?.querySelector<HTMLElement>('[data-sidebar-scroll]')
    if (scroller) scroller.scrollTop = 160
    return () => { try { localStorage.removeItem('ot.sidebar.group.filters') } catch { /* story only */ } }
  }, [])
  return (
    <div ref={column} className="flex h-[32rem] w-64 flex-col border-r border-default bg-canvas">
      <Sidebar route={{ view: 'inbox' }} user={storyUser} onSearch={noop} onShortcuts={noop} onToggleCollapse={noop} />
    </div>
  )
}

/** A folded group (sidebar-groups): Filters closed with its count on the heading, and the Projects heading stuck at the top of a scrolled tree. */
export const FoldedAndScrolled: StoryObj = { render: () => <FoldedScrolled /> }

/** The icon rail from 1024 px (`[`): icons only, names as tooltips, groups as dividers. */
export const Collapsed: StoryObj = {
  render: () => (
    <Column width="w-14"><Sidebar route={{ view: 'today' }} user={storyUser} onSearch={noop} onShortcuts={noop} collapsed onToggleCollapse={noop} /></Column>
  ),
}

/** Below 768 px the same sidebar is a drawer over a scrim, opened from the menu button or the More tab. */
export const PhoneDrawer: StoryObj = {
  render: () => (
    <div className="relative h-[52rem] overflow-hidden rounded-card border border-default bg-canvas" data-overlay>
      <div className="p-4 text-body text-muted">Inbox</div>
      <div className="absolute inset-0 bg-scrim" />
      <aside className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] border-r border-default bg-canvas" aria-label="Navigation">
        <div className="min-w-0 flex-1"><Sidebar route={{ view: 'inbox' }} user={storyUser} onSearch={noop} onShortcuts={noop} /></div>
      </aside>
    </div>
  ),
}
