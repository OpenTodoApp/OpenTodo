import type { Meta, StoryObj } from '@storybook/react-vite'
import { createView } from '../../lib/views'
import { seedProjectWithSections, seedToday, seeded, withSeed } from '../stories/fixtures'
import { DisplayScreen, type DisplayRoute } from './DisplayScreen'
import { DEFAULT_DISPLAY_OPTIONS, type DisplayOptions, type DisplayTarget } from './displayOptions'

// Rare screens (OpenSpec change screen-stories-rare, design D2): display mode, the
// chrome-free view for a wall screen or an e-ink tablet (`/display/…`), seeded.
const meta: Meta = { title: 'Screens/Display', parameters: { layout: 'fullscreen' } }
export default meta

const route = (target: DisplayTarget, options: Partial<DisplayOptions> = {}): DisplayRoute =>
  ({ view: 'display', target, options: { ...DEFAULT_DISPLAY_OPTIONS, ...options } })

/** Today: Earlier, Today and This Evening beside the next three days. */
export const Today: StoryObj = { ...withSeed(seedToday), render: () => <DisplayScreen route={route({ kind: 'today' })} /> }

/** Today at the largest size with high contrast, as `?contrast=high&size=xl` opens it. */
export const TodayHighContrastLarge: StoryObj = {
  ...withSeed(seedToday),
  render: () => <DisplayScreen route={route({ kind: 'today' }, { size: 'xl', contrast: 'high' })} />,
}

/** Upcoming: seven day columns. */
export const Upcoming: StoryObj = { ...withSeed(seedToday), render: () => <DisplayScreen route={route({ kind: 'upcoming' })} /> }

/** A project with its sections. */
export const Project: StoryObj = {
  ...withSeed(() => seedProjectWithSections(false)),
  render: () => <DisplayScreen route={route({ kind: 'project', id: seeded.website })} />,
}

/** A saved view. */
export const SavedView: StoryObj = {
  ...withSeed(async () => {
    await seedToday()
    seeded.view = await createView({ name: 'Errands and this week', query: '@errand | due <= 7 days' })
  }),
  render: () => <DisplayScreen route={route({ kind: 'view', id: seeded.view })} />,
}
