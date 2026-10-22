import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import { hideBulkToast, showBulkToast } from './toastStore'
import { UndoToast } from './UndoToast'

// The toast primitive (OpenSpec change moments-and-onboarding D9; design-system
// "Toast primitive"): one sentence, at most two controls with Undo first, bottom right
// from 640 px and bottom centre on phones. Held open here for the workbench.
const meta: Meta = { title: 'Overlay/Toast', parameters: { layout: 'fullscreen' } }
export default meta

const HOLD = 24 * 60 * 60 * 1000

function Shown({ label, action }: { label: string; action?: string }) {
  useEffect(() => {
    showBulkToast(label, 'story-undo', { ttl: HOLD, ...(action ? { action: { label: action, run: () => {} } } : {}) })
    return () => hideBulkToast()
  }, [label, action])
  // A transform makes the fixed region sit in this frame, so the capture shows it.
  return <div className="h-[28rem] transform-gpu bg-canvas"><UndoToast /></div>
}

/** After one task's action: the sentence and Undo. */
export const SingleAction: StoryObj = { name: 'Single action', render: () => <Shown label="Moved to Home" /> }

/** After a batch, with a second control after Undo. */
export const BatchWithTwoControls: StoryObj = { name: 'Batch with two controls', render: () => <Shown label="3 tasks rescheduled" action="Open" /> }

/** On a phone the region spans the width at the bottom (the 375 px capture shows it). */
export const Phone: StoryObj = { render: () => <Shown label="3 sample tasks removed" /> }
