import type { Meta, StoryObj } from '@storybook/react-vite'
import { DEMO_STATUS, resetAssistantStatus, setAssistantStatus } from '../../lib/assistantStatus'
import { seedInbox, storyUser, withSeed } from '../stories/fixtures'
import CommandPalette from './CommandPalette'

// Core screen: the command bar (OpenSpec change moments-and-onboarding D7;
// command-palette "Open and close the palette"): one floating bar, four modes. A
// bottom sheet at 375 px, a centred card at 1280 px.
// The assistant's status is module state: every story sets its own.
const meta: Meta = { title: 'Screens/Command bar', ...withSeed(async () => { await seedInbox(); resetAssistantStatus() }) }
export default meta

const noop = () => {}

/** Search, the default: what applies here, recent picks, the hint naming the prefixes. */
export const Search: StoryObj = { render: () => <CommandPalette user={storyUser} onClose={noop} showShortcuts={noop} /> }

/** Add: the quick add with its chips and tints. */
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
