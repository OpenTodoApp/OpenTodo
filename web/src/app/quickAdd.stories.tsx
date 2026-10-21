import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ReactNode, useEffect, useRef } from 'react'
import { QuickAdd } from './QuickAdd'
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
