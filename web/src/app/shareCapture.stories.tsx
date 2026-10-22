import type { Meta, StoryObj } from '@storybook/react-vite'
import { setPendingShare, ShareCapture } from './ShareCapture'
import { seedBase, withSeed } from './stories/fixtures'

// Rare screen (OpenSpec change screen-stories-rare, design D2): the capture screen
// (`/share`) that a page shared from another app or the browser extension opens.
const meta: Meta = { title: 'Screens/Capture' }
export default meta

/** A shared page: title, link and the selected text, ready to add. */
export const SharedPage: StoryObj = {
  ...withSeed(seedBase),
  beforeEach: () => {
    setPendingShare({ title: 'How to overwinter dahlias', text: 'Lift the tubers after the first frost and store them somewhere cool and dry.', url: 'https://example.com/garden/dahlias' })
    return () => setPendingShare(null)
  },
  render: () => <ShareCapture />,
}
