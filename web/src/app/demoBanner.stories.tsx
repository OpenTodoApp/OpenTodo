import type { Decorator, Meta, StoryObj } from '@storybook/react-vite'
import { DEMO_LIMIT_NOTICE, reloadBannerDismissed, setDemo } from '../lib/demo'
import { t } from '../lib/i18n'
import { DemoBanner } from './DemoBanner'
import { withClock } from './stories/fixtures'

// The demo banner (OpenSpec change lean-chrome D2, demo-mode "Demo sign-in and
// banner"): one line at every width, the idle lifetime from the demo record; the
// write-limit notice takes the line's place. Recorded at 375 and 1280 px.
const withDemo: Decorator = (Story) => {
  setDemo({ token: '', sandboxHours: { idle: 2, max: 24 }, resetsAt: 0 })
  try { sessionStorage.removeItem('opentodo.demoBannerDismissed') } catch { /* storage may be unavailable */ }
  reloadBannerDismissed()
  return <Story />
}
const meta: Meta = { title: 'Screens/Demo banner', decorators: [withDemo, withClock] }
export default meta

/** The plain line: the second sentence is left to Details below 640 px. */
export const Line: StoryObj = { render: () => <DemoBanner /> }
/** The sandbox's write budget is used up: the notice in the line's place. */
export const WriteLimit: StoryObj = { render: () => <DemoBanner notice={t(DEMO_LIMIT_NOTICE)} /> }
