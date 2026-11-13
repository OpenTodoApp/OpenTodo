import type { Meta, StoryObj } from '@storybook/react-vite'
import { useRef, useState } from 'react'
import { OutlineButton, OutlineColumn, type OutlineEntry } from './NoteOutline'

// A note's outline (OpenSpec change note-outline): the column beside a wide note with
// "Hotels" current, and the Outline button in the note's corner with its menu open.
const meta: Meta = { title: 'Task/Editor/Outline' }
export default meta

const HEADINGS: OutlineEntry[] = [
  { level: 1, text: 'Flights' }, { level: 2, text: 'Outbound' }, { level: 2, text: 'Return' },
  { level: 1, text: 'Hotels' }, { level: 3, text: 'Check-in after 15:00' }, { level: 1, text: 'Days' },
]

function Body() {
  return (
    <div className="notes-editor space-y-2">
      <h1>Flights</h1><p>Tuesday at 9:40 from Terminal 2.</p>
      <h2>Outbound</h2><p>Window seats, one bag each.</p>
      <h2>Return</h2><p>Sunday evening.</p>
      <h1>Hotels</h1><p>Two nights near the river.</p>
    </div>
  )
}

function Column() {
  const ref = useRef<HTMLElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-canvas p-4" data-outline-room>
      <div className="note-column" data-note-column>
        <div className="notes-frame" data-outline="column">
          <OutlineColumn ref={ref} items={HEADINGS} current={3} onGo={() => {}} onEscape={() => {}} menuOpen={open} onMenu={setOpen} />
          <div className="notes-host"><Body /></div>
        </div>
      </div>
    </div>
  )
}

function Button() {
  const [open, setOpen] = useState(true)
  return (
    <div className="max-w-xl bg-canvas p-4" style={{ minHeight: 420 }}>
      <div className="notes-frame" data-outline="menu" data-corner style={{ '--notes-corner': '2.25rem' } as React.CSSProperties}>
        <div className="notes-corner"><OutlineButton items={HEADINGS} current={3} onGo={() => {}} open={open} onOpenChange={setOpen} /></div>
        <div className="notes-host"><Body /></div>
      </div>
    </div>
  )
}

/** From a 52 rem room: the column at the note's start, the current heading marked. */
export const OutlineColumnBeside: StoryObj = { render: () => <Column /> }
/** The docked panel, project notes and phones: the Outline button and its menu. */
export const OutlineMenu: StoryObj = { render: () => <Button /> }
