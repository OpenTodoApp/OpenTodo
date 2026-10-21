import { describe, expect, it } from 'vitest'
import css from '../../index.css?raw'

// OpenSpec change tokens-v2, design D8 (design-system "Secondary text is one size"):
// every primitive that prints a time, a count or a duration uses tabular figures, so
// columns of numbers line up. Screens print numbers through these primitives.
const sources = import.meta.glob<string>(
  ['../Chips.tsx', '../patterns/ListGroupHeader.tsx', '../patterns/Sidebar.tsx', '../../app/review/charts.tsx', '../../app/calendar/DayColumn.tsx', '../../app/CalendarEvents.tsx', '../../app/calendar/PlanRow.tsx'],
  { query: '?raw', import: 'default', eager: true },
)
const src = (name: string) => Object.entries(sources).find(([p]) => p.endsWith(name))![1]

/** The className of the element that carries `marker` on the same line. */
function classOf(source: string, marker: string): string {
  const line = source.split('\n').find((l) => l.includes(marker))
  expect(line, `no line with ${marker}`).toBeDefined()
  return /className=(?:"([^"]*)"|\{`([^`]*)`)/.exec(line!)?.slice(1).find(Boolean) ?? ''
}

describe('tabular figures in the number primitives', () => {
  const cases: [string, string][] = [
    ['Chips.tsx', 'inline-flex min-w-0 items-center gap-1 text-meta'],
    ['Chips.tsx', 'rounded-chip bg-sunken'],
    ['Chips.tsx', 'data-label-more'],
    ['ListGroupHeader.tsx', 'data-group-count'],
    ['Sidebar.tsx', 'data-count'],
    ['charts.tsx', 'data-tile-value'],
    ['DayColumn.tsx', 'data-hour-label'],
    ['CalendarEvents.tsx', 'data-event-time'],
    ['PlanRow.tsx', 'data-plan-time'],
  ]
  for (const [file, marker] of cases) {
    it(`${file}: ${marker}`, () => {
      expect(classOf(src(file), marker)).toMatch(/(?:^|\s)tabular-nums(?:\s|$)/)
    })
  }

  it('the clocks set tabular figures', () => {
    for (const cls of ['.focus-clock', '.display-clock']) {
      const rule = css.split('\n').find((l) => l.startsWith(`${cls} {`))!
      expect(rule, cls).toContain('font-variant-numeric: tabular-nums')
    }
  })
})
