import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useState } from 'react'
import { ShortcutHelp } from '../ShortcutHelp'
import { armGPrefix, clearPrefix, registerShortcutScope } from './dispatch'
import { Spotlight } from './Spotlight'

// The sequence spotlight and the compact cheat sheet (OpenSpec change
// shortcut-spotlight): the card that waits after a hesitated `g`, and the `?` sheet
// with one line per shortcut and keycaps that never wrap.
const meta: Meta = { title: 'Shortcuts/Spotlight and cheat sheet' }
export default meta

const GO = ['go.inbox', 'go.today', 'go.upcoming', 'go.anytime', 'go.someday', 'go.completed', 'go.labels', 'go.projects', 'go.filter', 'go.views', 'go.trash',
  'go.day', 'go.week', 'go.month', 'go.plan', 'go.triage', 'go.review', 'go.next', 'go.waiting', 'go.focus', 'go.settings', 'go.help', 'go.find']

function Pending() {
  // The handlers a shell registers, then `g` pressed and held: the card shows at once.
  const [off] = useState(() => {
    const release = registerShortcutScope({ scope: 'global', handlers: Object.fromEntries(GO.map((id) => [id, () => {}])) })
    armGPrefix()
    return release
  })
  useEffect(() => () => { clearPrefix(); off() }, [off])
  return <div className="h-[600px] p-4 text-body text-muted">Today<Spotlight delay={0} /></div>
}

/** After `g` and a pause: what can follow, grouped, with a close button. */
export const SequenceSpotlight: StoryObj = { render: () => <Pending /> }

/** The `?` sheet in a list: the list's shortcuts first, compact rows, keycaps on the right. */
export const CheatSheet: StoryObj = { render: () => <ShortcutHelp onClose={() => {}} context={{ view: 'today' }} /> }
