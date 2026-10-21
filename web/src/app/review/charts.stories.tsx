import type { Meta, StoryObj } from '@storybook/react-vite'
import { ChartFigure, DotGrid, EmptyPanel, HBars, Heatmap, LineChart, StatTile, type HeatDay } from './charts'

// The dashboard's charts on their own (OpenSpec change stats-dashboard, task 3.2):
// light and dark, an empty and a dense case each, checked by the a11y and visual
// gates. Values are fixed, so the baselines never move with the clock.
const meta: Meta = { title: 'Screens/Statistics charts' }
export default meta

const table = { head: ['Item', 'Value'], rows: [['A', '1']] }

export const Tiles: StoryObj = {
  render: () => (
    <dl className="grid max-w-3xl grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile testId="done" label="Done" value="42" change={{ text: '+12 % vs last month', direction: 'up' }} note="including each day of a recurring task" />
      <StatTile testId="on-time" label="On time" value="86 %" change={{ text: '−3 pts vs last month', direction: 'down' }} note="of 28 tasks with a due date" />
      <StatTile testId="streak" label="Streak" value="9 days" note="Best: 21 days in the last 53 weeks" />
      <StatTile testId="tracked" label="Tracked" value="31h 20m" change={{ text: 'No change vs last month', direction: 'same' }} note="against 28h estimated" />
    </dl>
  ),
}

const week = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const Line: StoryObj = {
  render: () => (
    <div className="max-w-xl">
      <ChartFigure title="Am I keeping up?" summary="22 completed and 19 created" table={table}>
        <LineChart aName="Completed" bName="Created" summary="22 completed and 19 created"
          points={week.map((d, i) => ({ label: d, name: d, a: [3, 5, 4, 6, 2, 1, 1][i], b: [4, 3, 5, 2, 3, 1, 1][i] }))} />
      </ChartFigure>
    </div>
  ),
}

export const LineDense: StoryObj = {
  render: () => (
    <div className="max-w-xl">
      <ChartFigure title="Am I keeping up?" summary="A month, per day" table={table}>
        <LineChart aName="Completed" bName="Created" summary="A month, per day"
          points={Array.from({ length: 31 }, (_, i) => ({ label: String(i + 1), name: `Day ${i + 1}`, a: (i * 7) % 9, b: (i * 5) % 7 }))} />
      </ChartFigure>
    </div>
  ),
}

export const Bars: StoryObj = {
  render: () => (
    <div className="max-w-xl">
      <ChartFigure title="Where does my time go?" summary="Tracked time per project" table={table}>
        <HBars summary="Tracked time per project" bars={[
          { label: 'Client A', value: 840, text: '14h' }, { label: 'Home', value: 420, text: '7h' }, { label: 'Side project', value: 300, text: '5h' },
          { label: 'Inbox', value: 120, text: '2h' }, { label: 'Other', value: 40, text: '40m' },
        ]} />
      </ChartFigure>
    </div>
  ),
}

const start = Date.UTC(2025, 9, 13)
const heat = (fn: (i: number) => number): (HeatDay | null)[][] => Array.from({ length: 53 }, (_, w) => Array.from({ length: 7 }, (_, d) => {
  const i = w * 7 + d
  if (i > 366) return null
  const count = fn(i)
  return { date: new Date(start + i * 86_400_000).toISOString().slice(0, 10), count, level: count === 0 ? 0 : Math.min(4, Math.ceil(count / 2)) }
}))
const months = Array.from({ length: 53 }, (_, w) => (w % 4 === 0 ? ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'][w / 4] ?? '' : ''))
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const YearHeatmap: StoryObj = {
  render: () => (
    <ChartFigure title="A year of done tasks" summary="812 completed in the last 53 weeks" table={table} wide>
      <Heatmap weeks={heat((i) => ((i * 13) % 11) % 9)} rowLabels={days} columnLabels={months} tip={(d) => `${d.date}: ${d.count} completed`} summary="812 completed" />
    </ChartFigure>
  ),
}

export const YearHeatmapEmpty: StoryObj = {
  render: () => (
    <ChartFigure title="A year of done tasks" summary="Nothing completed" table={table} wide>
      <Heatmap weeks={heat(() => 0)} rowLabels={days} columnLabels={months} tip={(d) => `${d.date}: 0 completed`} summary="Nothing completed" />
    </ChartFigure>
  ),
}

export const Hours: StoryObj = {
  render: () => (
    <div className="max-w-xl">
      <ChartFigure title="When do I get things done?" summary="Most often on Tuesday at 10:00" table={table}>
        <DotGrid summary="Most often on Tuesday at 10:00" max={9}
          counts={days.map((_, r) => Array.from({ length: 24 }, (_, c) => (c >= 8 && c <= 18 && r < 5 ? (r * 3 + c * 5) % 10 : 0)))}
          rowLabels={days} columnLabels={Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))} tip={(r, c) => `${days[r]} ${c}:00`} />
      </ChartFigure>
    </div>
  ),
}

export const Empty: StoryObj = {
  render: () => (
    <div className="max-w-xl space-y-3">
      <EmptyPanel title="How good are my estimates?">Needs at least three completed tasks with an estimate and tracked time; 1 so far.</EmptyPanel>
      <EmptyPanel title="When do I get things done?">Complete a few tasks in this period to see when you work best.</EmptyPanel>
    </div>
  ),
}
