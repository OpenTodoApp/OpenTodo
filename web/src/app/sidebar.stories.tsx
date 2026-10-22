import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Sidebar } from './Sidebar'
import { seedInbox, seedToday, seedTracking, seeded, storyUser, withSeed } from './stories/fixtures'
import { createProject, createTask } from '../lib/ops'
import { storeWorkspaces, switchTo } from '../lib/workspaces'

// Core screen: the sidebar (OpenSpec change ux-overhaul, task 8.7; app-shell
// "Sidebar structure", "Resizable sidebar", "No desktop top bar"). The real
// component over a seeded database: Inbox, Today, Upcoming and Calendar on top, the
// More group, then the scrolling projects (one nested), labels and filters, and the
// one-row footer (quiet-sidebar): counts only on Inbox and Today at rest, project
// counts on hover or focus, markers as one accent dot. sidebar-v2: the brand header,
// quiet rows, group controls on hover or focus, More as a group heading, the footer
// pill and the tinted column. The clock is frozen, so the counts never move.
const meta: Meta = { title: 'Screens/Sidebar', ...withSeed(seedInbox) }
export default meta

const noop = () => {}

/** The sidebar column's colour as the shell sets it from 768 px with a fine pointer (sidebar-v2 D8); the sticky group headers read the same variable. */
const TINTED = 'bg-(--sidebar-bg) [--sidebar-bg:var(--color-sidebar)]'

/** The shell's sidebar column from 768 px: 16 rem wide, full height (tall enough here to show every group without scrolling). */
function Column({ children, width = 'w-64' }: { children: ReactNode; width?: string }) {
  return <div className={`flex h-[52rem] ${width} flex-col border-r border-default ${TINTED}`}>{children}</div>
}

/** The Inbox open on the tinted column: the brand header, the primary destinations with their counts, projects and labels. */
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
    <div ref={column} className={`flex h-[32rem] w-64 flex-col border-r border-default ${TINTED}`}>
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
      <aside className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] border-r border-default bg-(--sidebar-bg) [--sidebar-bg:var(--color-surface)]" aria-label="Navigation">
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

/** Quiet markers (quiet-sidebar D4, sidebar-v2 D7): the weekly review nine days old (no dot on More: it is on the Review entry inside it) and one unread notification (a dot on the bell). */
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

/** Waits for an element in the column, acts on it, then lets the visual check run. */
function Acting({ find, act, children }: { find: (root: HTMLElement) => HTMLElement | null; act: (el: HTMLElement) => void; children: ReactNode }) {
  const column = useRef<HTMLDivElement>(null)
  const [pending, setPending] = useState(true)
  useEffect(() => {
    let tries = 0
    const timer = setInterval(() => {
      const el = column.current ? find(column.current) : null
      if (el || ++tries > 100) {
        clearInterval(timer)
        if (el) act(el)
        requestAnimationFrame(() => setPending(false))
      }
    }, 20)
    return () => clearInterval(timer)
  }, [find, act])
  // data-story-pending: the visual check waits until the action is done.
  return <div ref={column} data-story-pending={pending || undefined}>{children}</div>
}

const projectsAll = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-sidebar-group="Projects"] [data-group-actions] button')
const focus = (el: HTMLElement) => el.focus()
/** Group controls on focus (sidebar-v2 D5): hidden by opacity at rest, shown while the header has the pointer or focus; here the All action of Projects is focused. */
export const HoverControls: StoryObj = {
  ...withSeed(seedToday),
  render: () => <Acting find={projectsAll} act={focus}><Column><Sidebar route={{ view: 'inbox' }} user={storyUser} onSearch={noop} onShortcuts={noop} onToggleCollapse={noop} /></Column></Acting>,
}

/** A running entry (sidebar-v2 D6): the pill takes the name's place in the footer's one row, with Stop inside it. */
export const RunningEntry: StoryObj = {
  ...withSeed(seedTracking),
  render: () => <Column><Sidebar route={{ view: 'today' }} user={storyUser} onSearch={noop} onShortcuts={noop} onToggleCollapse={noop} /></Column>,
}

const moreHeading = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-sidebar-more-menu] button[aria-haspopup="menu"]')
const open = (el: HTMLElement) => el.click()
/** More as a group heading (sidebar-v2 D7), open while Someday is the current place: the review-due dot is on the Review entry. */
export const MoreGroup: StoryObj = {
  ...withSeed(seedMarkers),
  render: () => <Acting find={moreHeading} act={open}><Column><Sidebar route={{ view: 'someday' }} user={storyUser} onSearch={noop} onShortcuts={noop} onToggleCollapse={noop} /></Column></Acting>,
}

// ---- workspaces (OpenSpec change workspaces, task 5.8) ----

/** Two workspaces: Personal (the seeded Inbox) and Family with one project; the device is in Family. */
async function seedWorkspaces(): Promise<void> {
  await seedInbox()
  const me = { userId: storyUser.id, name: storyUser.name, role: 'owner' as const }
  await storeWorkspaces([
    { id: 'ws-personal', name: 'Personal', icon: '', color: '', default: true, role: 'owner', ownerId: storyUser.id, members: [me], groups: [] },
    { id: 'ws-family', name: 'Family', icon: 'house', color: '#22c55e', default: false, role: 'owner', ownerId: storyUser.id,
      members: [me, { userId: 'u-bob', name: 'Bob Okafor', role: 'member' }], groups: [{ id: 'g-adults', name: 'Adults', members: [storyUser.id, 'u-bob'] }] },
  ])
  await switchTo('ws-family')
  const house = await createProject({ name: 'House' })
  await createTask({ title: 'Fix the gutter', project_id: house })
  await createTask({ title: 'Buy a birthday present' })
}

/** The header as the workspace control (workspaces D6): the current workspace's mark and name, no new row. */
export const WorkspaceControl: StoryObj = {
  ...withSeed(seedWorkspaces),
  render: () => <Column><Sidebar route={{ view: 'inbox' }} user={storyUser} onSearch={noop} onShortcuts={noop} onToggleCollapse={noop} /></Column>,
}

const workspaceTrigger = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-workspace-trigger]')
const press = (el: HTMLElement) => el.click()
/** The switcher open: the workspaces with their Inbox and Today counts, the current one checked, New workspace and Manage workspaces. */
export const SwitcherOpen: StoryObj = {
  ...withSeed(seedWorkspaces),
  render: () => (
    <Acting find={workspaceTrigger} act={press}>
      <Column><Sidebar route={{ view: 'inbox' }} user={storyUser} onSearch={noop} onShortcuts={noop} onToggleCollapse={noop} /></Column>
    </Acting>
  ),
}

/** One workspace (the account never created one): the header reads OpenTodo · Personal. */
export const OneWorkspace: StoryObj = {
  ...withSeed(async () => {
    await seedInbox()
    await storeWorkspaces([{ id: 'ws-personal', name: 'Personal', icon: '', color: '', default: true, role: 'owner', ownerId: storyUser.id, members: [], groups: [] }])
  }),
  render: () => <Column><Sidebar route={{ view: 'inbox' }} user={storyUser} onSearch={noop} onShortcuts={noop} onToggleCollapse={noop} /></Column>,
}
