import type { Meta, StoryObj } from '@storybook/react-vite'
import { DEMO_STATUS, resetAssistantStatus, setAssistantStatus } from '../../lib/assistantStatus'
import { seedInbox, storyUser, withSeed } from '../stories/fixtures'
import CommandPalette from './CommandPalette'

// Core screen: the command bar (OpenSpec change moments-and-onboarding D7;
// command-palette "Open and close the palette"; palette-quick-add D4-D6): one bar, four
// modes. A full-screen sheet with the segmented control at 375 px; at 1280 px a 40 rem
// card near the top, the results with their keycaps and a footer that names the keys.
// The assistant's status is module state: every story sets its own.
const meta: Meta = { title: 'Screens/Command bar', ...withSeed(async () => { await seedInbox(); resetAssistantStatus() }) }
export default meta

const noop = () => {}

/** Search, the default: what applies here, recent picks, the footer naming the keys and the prefixes. */
export const Search: StoryObj = { render: () => <CommandPalette user={storyUser} onClose={noop} showShortcuts={noop} /> }

/** Add: the quick-add palette, its field rows (values, hints, the tokens) and its footer. */
export const AddWithChips: StoryObj = {
  name: 'Add with chips',
  render: () => <CommandPalette user={storyUser} onClose={noop} showShortcuts={noop} initialMode="add" initialText="Call Sam tomorrow at 4pm p2" />,
}

/** Commands: the registry only. */
export const Commands: StoryObj = { render: () => <CommandPalette user={storyUser} onClose={noop} showShortcuts={noop} initialMode="commands" /> }

/** Ask, shown only when the assistant is available. */
export const Ask: StoryObj = {
  ...withSeed(async () => { await seedInbox(); setAssistantStatus({ ...DEMO_STATUS, available: true, enabled: true, reason: '', consented: true } as never) }),
  render: () => <CommandPalette user={storyUser} onClose={noop} showShortcuts={noop} initialMode="ask" />,
}
