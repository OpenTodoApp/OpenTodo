import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Sidebar } from './Sidebar'
import { seedInbox, seedToday, seeded, storyUser, withSeed } from './stories/fixtures'

// Core screen: the sidebar (OpenSpec change ux-overhaul, task 8.7; app-shell
// "Sidebar structure", "Resizable sidebar", "No desktop top bar"). The real
// component over a seeded database: Inbox, Today, Upcoming and Calendar on top, the
// More group, then the scrolling projects (one nested), labels and filters, and the
// one-row footer (quiet-sidebar): counts only on Inbox and Today at rest, project
// counts on hover or focus, markers as one accent dot. The clock is frozen, so the
// counts never move.
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

/** Favourites (sidebar-favourites): a pinned saved filter, project and label, mixed in the user's order above Projects; Labels and Filters folded on this new device. */
async function seedFavourites() {
  await seedInbox()
  const { createView } = await import('../lib/views')
  const { pin } = await import('../lib/favourites')
  seeded.deepWorkView = await createView({ name: 'Deep work', query: '@deep-work', pinned: false })
  await pin('view', seeded.deepWorkView)
  await pin('project', seeded.website)
  await pin('label', seeded.errand)
}
export const Favourites: StoryObj = {
  ...withSeed(seedFavourites),
  render: () => (
    <Column><Sidebar route={{ view: 'view', id: seeded.deepWorkView }} user={storyUser} onSearch={noop} onShortcuts={noop} onToggleCollapse={noop} /></Column>
  ),
}

/** Quiet markers (quiet-sidebar D4, D7): the weekly review nine days old (one dot on More, its words in the tooltip and the name) and one unread notification (a dot on the bell). */
async function seedMarkers() {
  await seedInbox()
  const { db } = await import('../lib/db')
  const { REVIEW_DEFAULTS } = await import('../lib/ops')
  await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', completed_at: Date.now() - 9 * 86_400_000, _clock: {} })
  await db.notifications.put({
    id: 'story-n1', kind: 'assigned', createdAt: Date.now() - 3_600_000, readAt: null,
    payload: { assigneeId: storyUser.id, actorId: 'u-mara', actorName: 'Mara', taskId: seeded.inboxTask, taskTitle: 'Renew passport', projectId: null, projectName: '', at: Date.now() - 3_600_000 },
  } as never)
}
export const Markers: StoryObj = {
  ...withSeed(seedMarkers),
  render: () => (
    <Column><Sidebar route={{ view: 'inbox' }} user={storyUser} onSearch={noop} onShortcuts={noop} onToggleCollapse={noop} /></Column>
  ),
}

/** A project row focused by keyboard (quiet-sidebar D7): its count shows while focused, and is always in its name. */
function FocusedProject() {
  const column = useRef<HTMLDivElement>(null)
  const [pending, setPending] = useState(true)
  useEffect(() => {
    let tries = 0
    const timer = setInterval(() => {
      const row = column.current?.querySelector<HTMLElement>(`[data-project-id="${seeded.work}"]`)
      if (row?.querySelector('[data-open-count]') || ++tries > 100) {
        clearInterval(timer)
        row?.focus()
        requestAnimationFrame(() => setPending(false))
      }
    }, 20)
    return () => clearInterval(timer)
  }, [])
  return (
    // data-story-pending: the visual check waits until the row is focused.
    <div ref={column} data-story-pending={pending || undefined}><Column><Sidebar route={{ view: 'inbox' }} user={storyUser} onSearch={noop} onShortcuts={noop} onToggleCollapse={noop} /></Column></div>
  )
}
export const CountOnFocus: StoryObj = { ...withSeed(seedToday), render: () => <FocusedProject /> }

/** The account menu open (quiet-sidebar D5): Settings, Help and Keyboard shortcuts with their keys, then Sign out. */
function AccountMenuOpen() {
  const column = useRef<HTMLDivElement>(null)
  const [pending, setPending] = useState(true)
  useEffect(() => {
    let tries = 0
    const timer = setInterval(() => {
      const trigger = column.current?.querySelector<HTMLElement>('[data-account-menu]')
      if (trigger || ++tries > 50) {
        clearInterval(timer)
        trigger?.click()
        requestAnimationFrame(() => setPending(false))
      }
    }, 20)
    return () => clearInterval(timer)
  }, [])
  return (
    // data-story-pending: the visual check waits until the menu is open.
    <div ref={column} data-story-pending={pending || undefined}><Column><Sidebar route={{ view: 'inbox' }} user={storyUser} onSearch={noop} onShortcuts={noop} onToggleCollapse={noop} onSignOut={noop} /></Column></div>
  )
}
export const AccountMenu: StoryObj = { render: () => <AccountMenuOpen /> }
