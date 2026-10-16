import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { Button, DESKTOP_HEADER_QUERY, IconButton, MenuItem, MenuSeparator, PageActions, PageBarTitle, PageBody, PageHeader, useMediaQuery, usePageBar } from '../ui'
import { withClock } from './stories/fixtures'

// Core screen: the page header (OpenSpec change ux-overhaul, task 8.7; app-shell
// "Page template", "No desktop top bar"; design-system "Page template primitives").
// The pattern as the screens use it: one title size, optional meta, at most two
// visible actions, the overflow menu and Help. Below 768 px the title, the overflow
// and Help move to the shell's bar, mirrored here by `PhoneBar`, and the page's
// own actions stay in the page as a wrapping row.
const meta: Meta = { title: 'Screens/Page header', decorators: [withClock] }
export default meta

const noop = () => {}

const rows = (titles: string[]) => (
  <ul className="space-y-0.5">
    {titles.map((t) => (
      <li key={t} className="flex min-h-(--size-row) items-center gap-2 rounded-control px-2 hover:bg-sunken">
        <span className="h-5 w-4" /><span className="h-5 w-5 rounded-full border-2 border-p4" /><span className="text-body">{t}</span>
      </li>
    ))}
  </ul>
)
const inbox = ['Renew passport', 'Call the bank about the card limit', 'Plan the autumn trip', 'Return the library books', 'Reply to Mara about the workshop']

/** The shell's bar below 768 px, from the page-bar store the header writes to. */
function PhoneBar() {
  const bar = usePageBar()
  const desktop = useMediaQuery(DESKTOP_HEADER_QUERY)
  if (desktop) return null
  return (
    <header className="flex min-h-12 items-center gap-1 border-b border-default px-2" data-phone-bar>
      <IconButton icon="menu" label="Open menu" onClick={noop} className="touch-target" />
      {bar?.back && <IconButton icon="arrow-left" label={bar.back.label} onClick={bar.back.onClick} className="touch-target" />}
      <div className="min-w-0 flex-1">
        <PageBarTitle>{bar?.title}</PageBarTitle>
        {bar?.subtitle && <p className="truncate text-meta text-muted">{bar.subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">{bar && <PageActions overflow={bar.overflow} menu={bar.menu} help={bar.help} />}</div>
    </header>
  )
}

function Page({ children }: { children: ReactNode }) {
  return (
    <div className="-m-4 h-[24rem] overflow-y-auto bg-canvas">
      <PhoneBar />
      <PageBody width="list">{children}</PageBody>
    </div>
  )
}

/** Title only: the Inbox. */
export const TitleOnly: StoryObj = {
  render: () => <Page><PageHeader title="Inbox" />{rows(inbox)}</Page>,
}

/** Title and meta: Today with its date. */
export const TitleAndMeta: StoryObj = {
  render: () => <Page><PageHeader title="Today" meta="Wednesday 14 October" />{rows(inbox.slice(0, 3))}</Page>,
}

/** Two actions, the overflow menu and Help: the most a header shows. */
export const ActionsAndHelp: StoryObj = {
  render: () => (
    <Page>
      <PageHeader title="Upcoming" help="upcoming"
        actions={<><Button variant="ghost" size="sm" icon="filter">Filter</Button><Button variant="ghost" size="sm" icon="calendar-range">Plan</Button></>}
        overflow={<><MenuItem label="Select tasks" icon="check" onSelect={noop} /><MenuSeparator /><MenuItem label="Show completed" icon="circle-check-big" onSelect={noop} /></>} />
      {rows(inbox)}
    </Page>
  ),
}

/** A subtitle: the board's current column, shown under the title in the phone bar only. */
export const WithSubtitle: StoryObj = {
  render: () => (
    <Page>
      <PageHeader title="Website launch" subtitle="In progress · column 2 of 3" help="project"
        leading={<span className="h-3 w-3 shrink-0 rounded-full bg-hue-solid" data-hue="violet" />}
        overflow={<MenuItem label="Rename" icon="pencil" onSelect={noop} />} />
      {rows(['Review the homepage copy', 'Compress the hero images'])}
    </Page>
  ),
}

/** A colour dot before the title and a segmented control on the second row: the project page. */
export const LeadingDot: StoryObj = {
  render: () => (
    <Page>
      <PageHeader title="Home" leading={<span className="h-3 w-3 shrink-0 rounded-full bg-hue-solid" data-hue="green" />} meta="6 open" help="project"
        actions={<Button variant="ghost" size="sm" icon="users">Share</Button>}
        overflow={<><MenuItem label="Rename" icon="pencil" onSelect={noop} /><MenuItem label="Project activity" icon="history" onSelect={noop} /><MenuSeparator /><MenuItem label="Archive project" icon="archive" danger onSelect={noop} /></>}>
        <div role="group" aria-label="Project layout" className="inline-flex rounded-control border border-default p-0.5 text-body">
          <button type="button" aria-pressed className="rounded-control bg-sunken px-2.5 py-1 font-medium">List</button>
          <button type="button" className="px-2.5 py-1 text-muted">Board</button>
        </div>
      </PageHeader>
      {rows(['Water the plants', 'Fix the bike light', 'Buy a birthday present for Sam'])}
    </Page>
  ),
}

/** A long title truncates; the actions keep their place at 375 px. */
export const LongTitle: StoryObj = {
  render: () => (
    <Page>
      <PageHeader title="Kitchen renovation: quotes, permits, the builder's schedule and everything we still have to decide" meta="12 open" help="project"
        leading={<span className="h-3 w-3 shrink-0 rounded-full bg-hue-solid" data-hue="orange" />}
        actions={<Button variant="ghost" size="sm" icon="filter" aria-label="Filter" />} overflow={<MenuItem label="Rename" onSelect={noop} />} />
      {rows(['Call the builder', 'Compare the two quotes'])}
    </Page>
  ),
}
