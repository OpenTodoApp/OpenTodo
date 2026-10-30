import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ReactNode, useEffect, useRef } from 'react'
import { QuickAdd } from './QuickAdd'
import { PasteOfferPanel } from './quickadd/PasteOffer'
import { HEX, label, withClock } from './stories/fixtures'

// Core screen: quick add (OpenSpec change ux-overhaul, task 8.7; natural-language
// quick add "Chips for recognised attributes").
// Static props and a frozen clock: a prefilled line is parsed like typed text, so
// the chips (date, project, label, priority, estimate) are the same on every run.
const meta: Meta = { title: 'Screens/Quick add', decorators: [withClock] }
export default meta

const noop = async () => {}
const projects = [
  { id: 'p-work', name: 'Work', parent_id: null },
  { id: 'p-web', name: 'Website launch', parent_id: 'p-work' },
  { id: 'p-home', name: 'Home', parent_id: null },
]
const labels = [label('l-errand', 'errand', HEX.orange), label('l-deep', 'deep-work', HEX.violet)]

/** The quick add sits under the page header, in the list's width. */
function Frame({ children }: { children: ReactNode }) {
  return <div className="max-w-3xl rounded-card border border-default bg-surface px-3 py-2 shadow-1">{children}</div>
}

/** Empty: the placeholder names the list; nothing under the field (lean-chrome D1). */
export const Empty: StoryObj = {
  render: () => <Frame><QuickAdd placeholder="Add a task to Inbox" projects={projects} labels={labels} onAdd={noop} hideHint /></Frame>,
}

/** A typed line with every attribute: the date, a nested project, a label, the priority and an estimate become chips. */
export const WithChips: StoryObj = {
  render: () => (
    <Frame>
      <QuickAdd placeholder="Add a task to Inbox" projects={projects} labels={labels} onAdd={noop} hideHint
        initialValue="Call the bank tomorrow 3pm #Website @errand p1 +30m" />
    </Frame>
  ),
}

/** A label the account does not have yet: the chip says "new", and × keeps the word as text. */
export const NewLabel: StoryObj = {
  render: () => (
    <Frame>
      <QuickAdd placeholder="Add a task to Inbox" projects={projects} labels={labels} onAdd={noop} hideHint initialValue="Book the dentist @health" />
    </Frame>
  ),
}

/** Typing `#web`: the project list under the field, Create last (smart-title-tokens). */
function Suggesting({ line }: { line: string }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(line.length, line.length)
    el.dispatchEvent(new Event('select', { bubbles: true }))
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }))
  }, [line])
  return (
    <Frame>
      <div className="pb-48">
        <QuickAdd ref={ref} placeholder="Add a task to Inbox" projects={projects} labels={labels} onAdd={noop} hideHint initialValue={line} />
      </div>
    </Frame>
  )
}

export const ProjectSuggestions: StoryObj = { render: () => <Suggesting line="Plan the launch #web" /> }

/** A #token that names no project stays in the title, and a grey chip says so; a new label is named. */
export const UnmatchedToken: StoryObj = {
  render: () => (
    <Frame>
      <QuickAdd placeholder="Add a task to Inbox" projects={projects} labels={labels} onAdd={noop} hideHint
        initialValue="Rake leaves #gardn @urgent tomorrow" />
    </Frame>
  ),
}

/** The quick-add palette (palette-quick-add D2): field rows with values, hints and the token that sets each. */
export const Palette: StoryObj = {
  render: () => (
    <div className="max-w-[40rem] overflow-hidden rounded-popover border border-strong bg-pop shadow-3">
      <QuickAdd layout="palette" placeholder="Add a task…" projects={projects} labels={labels} onAdd={noop} onAddAndOpen={noop} hideHint
        initialValue="Call the bank tomorrow 3pm #Website @errand p2" escape={{ label: 'Close', run: () => {} }} />
    </div>
  ),
}

/** The phone's sheet (palette-quick-add D7): neutral chips, a dashed placeholder for the label, the tool row and send. */
export const PhoneSheet: StoryObj = {
  render: () => (
    <div className="max-w-sm rounded-t-popover border-t border-strong bg-pop pt-3 shadow-3">
      <QuickAdd layout="sheet" placeholder="Add a task…" projects={projects} labels={labels} onAdd={noop} hideHint initialValue="Call the bank tomorrow 3pm #Home" />
    </div>
  ),
}

/** A pasted list (paste-to-tasks D1): the offer under the empty field, five lines as they will be titled and how many more. */
export const PasteOffer: StoryObj = {
  render: function PasteOfferStory() {
    const field = useRef<HTMLDivElement>(null)
    return (
      <Frame>
        <div ref={field}><QuickAdd placeholder="Add a task to Inbox" projects={projects} labels={labels} onAdd={noop} hideHint /></div>
        <PasteOfferPanel anchor={field} kind="tasks" lines={['Milk', 'Eggs', 'Bread', 'Butter', 'Strawberry jam', 'Tea', 'Rice']}
          onClose={() => {}} onConfirm={noop} onPasteAsLine={() => {}} />
      </Frame>
    )
  },
}
