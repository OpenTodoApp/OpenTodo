import type { Meta, StoryObj } from '@storybook/react-vite'
import { StartGuide } from './FirstRun'
import { seedInbox, storyUser, withSeed } from './stories/fixtures'
import { TaskListView } from './TaskListView'

// Core screen: the start guide (OpenSpec change lean-chrome D3-D5, D8; first-run
// "Three-step first run"). Each step over the real, seeded Inbox: a bottom sheet of
// at most two thirds of the screen at 375 px, a centred card at 1280 px. The last
// view is the first-day checklist (moments-and-onboarding D5).
const meta: Meta = { title: 'Screens/Start guide', ...withSeed(seedInbox) }
export default meta

const noop = () => {}

function Over({ step }: { step: number }) {
  return (
    <>
      <div className="-m-4 h-[44rem] overflow-y-auto bg-canvas"><TaskListView route={{ view: 'inbox' }} userId={storyUser.id} userRole={storyUser.role} /></div>
      <StartGuide self={false} userId={storyUser.id} onClose={noop} initialStep={step} />
    </>
  )
}

/** Step 1: its own quick add, focused, with one example; the task lands in the Inbox behind. */
export const AddFirstTask: StoryObj = { render: () => <Over step={0} /> }
/** Step 2: how you work (Companion preselected) and light, dark or system. */
export const HowYouWork: StoryObj = { render: () => <Over step={1} /> }
/** Step 3: install the app, or skip. */
export const Install: StoryObj = { render: () => <Over step={2} /> }
/** The last view, "Your first day" (moments-and-onboarding D5): three steps read from the seeded data. */
export const YourFirstDay: StoryObj = { name: 'Your first day', render: () => <Over step={3} /> }
