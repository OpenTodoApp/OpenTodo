import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { CalendarView } from '../CalendarView'
import { replanRequest } from '../signals'
import { seedCalendarWeek, withSeed } from '../stories/fixtures'

// Core screen: re-plan the rest of the day (OpenSpec change replan-the-day). The seeded
// week at the frozen noon has three missed morning blocks; the preview is open. From
// 768 px the header's lead line is the bar (count, Apply, Cancel) and the grid draws
// the ghosts at their new places with the originals faint; on a phone it is a bottom
// sheet listing "09:00 → 13:15" rows. The workbench captures both widths, light and dark.
const meta: Meta = { title: 'Screens/Re-plan the day', ...withSeed(seedCalendarWeek) }
export default meta

function Preview() {
  // Open the preview as Today's menu does, before the view mounts.
  useState(() => replanRequest.set('open'))
  return <div className="-m-4 h-[48rem] overflow-y-auto bg-canvas"><CalendarView mode="day" /></div>
}

/** Day at noon: three moves after the lunch block, the bar in the header. */
export const Day: StoryObj = {
  render: () => <Preview />,
}
