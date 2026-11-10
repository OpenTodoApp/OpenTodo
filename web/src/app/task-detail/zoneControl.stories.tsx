import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Due, Task } from '../../lib/types'
import { ZoneControl } from './ZoneControl'

// Zone control of the task panel (OpenSpec change task-detail-redesign, design D4).
// Fixed dates and a fixed viewer zone, so nothing depends on the clock.
const meta: Meta = { title: 'Task/Zone control' }
export default meta

const VIEWER = 'Europe/Berlin'
const task = (due: Due): Task => ({ id: `t-${due.tz ?? 'f'}-${due.time ?? 'none'}`, title: 'Call Ana', due } as Task)
const Row = ({ label, due }: { label: string; due: Due }) => (
  <div className="flex items-center gap-3"><span className="w-40 text-meta text-muted">{label}</span><ZoneControl task={task(due)} viewerZone={VIEWER} /></div>
)

export const States: StoryObj = {
  render: () => (
    <div className="space-y-3">
      <Row label="Floating" due={{ date: '2026-11-02', time: '15:00' }} />
      <Row label="In the viewer's zone" due={{ date: '2026-11-02', time: '15:00', tz: VIEWER }} />
      <Row label="In another zone" due={{ date: '2026-11-02', time: '15:00', tz: 'America/New_York' }} />
      <Row label="No time (disabled)" due={{ date: '2026-11-02' }} />
    </div>
  ),
}

/** At the end of the Do on time line (when-picker D3): quiet text, "Floating" or the city. */
export const Inline: StoryObj = {
  render: () => (
    <div className="w-80 max-w-full space-y-2">
      {[{ date: '2026-11-02', time: '15:00' }, { date: '2026-11-02', time: '15:00', tz: 'America/New_York' }].map((due) => (
        <div key={due.tz ?? 'floating'} className="flex items-center gap-2">
          <span className="text-body tabular-nums text-default">15:00</span>
          <span className="ml-auto"><ZoneControl task={task(due)} viewerZone={VIEWER} variant="inline" /></span>
        </div>
      ))}
    </div>
  ),
}
