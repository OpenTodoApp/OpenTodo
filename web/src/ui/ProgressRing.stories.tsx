import type { Meta, StoryObj } from '@storybook/react-vite'
import { ProgressRing } from './ProgressRing'

const meta: Meta = { title: 'UI/ProgressRing' }
export default meta

/** The shares the All projects table shows, with the percentage beside the ring. */
export const Shares: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-2 text-body">
      {[0, 0.2, 0.38, 0.61, 1].map((v) => (
        <span key={v} className="inline-flex items-center gap-1.5 tabular-nums"><ProgressRing value={v} />{Math.round(v * 100)}%</span>
      ))}
    </div>
  ),
}
