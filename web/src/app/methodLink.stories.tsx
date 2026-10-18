import type { Meta, StoryObj } from '@storybook/react-vite'
import { setMethodMode } from '../lib/method/mode'
import { PageHeader } from '../ui'
import { useWithMethod } from './help/MethodLink'
import { withClock, withSeed } from './stories/fixtures'

// The reference from a screen to the Open Loops method (OpenSpec change
// open-loops-method, design D8): the move beside the title, as a link to the
// method page in Help. Nothing in Lists only.
const meta: Meta = { title: 'Screens/Method link', decorators: [withClock] }
export default meta

function Headers() {
  return (
    <div className="space-y-2">
      <PageHeader title="Inbox" help="inbox" meta={useWithMethod('catch')} sticky={false} />
      <PageHeader title="Process the Inbox" help="inbox/triage" meta={useWithMethod('clarify', '4 of 17')} sticky={false} />
      <PageHeader title="Weekly review" icon="clipboard-check" meta={useWithMethod('review')} sticky={false} />
    </div>
  )
}

/** Companion: each header names the move it serves. */
export const Companion: StoryObj = {
  ...withSeed(() => setMethodMode('companion')),
  render: () => <Headers />,
}

/** Lists only: the headers exactly as without the method. */
export const ListsOnly: StoryObj = {
  ...withSeed(async () => {}),
  render: () => <Headers />,
}
