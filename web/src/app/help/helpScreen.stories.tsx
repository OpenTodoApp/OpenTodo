import type { Meta, StoryObj } from '@storybook/react-vite'
import { withClock } from '../stories/fixtures'
import { HelpView } from './HelpView'

// Rare screens (OpenSpec change screen-stories-rare, design D2): Help (`/help`) and
// one guide (`/help/sections-and-boards`), from the bundled guides.
const meta: Meta = { title: 'Screens/Help', decorators: [withClock] }
export default meta

/** The index: search, the shortcuts into the guides and the sections. */
export const Index: StoryObj = { render: () => <HelpView /> }

/** A guide with its contents. */
export const Guide: StoryObj = { render: () => <HelpView page="sections-and-boards" /> }
