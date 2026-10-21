// One Inbox rule (OpenSpec change inbox-means-unplaced, design D2): the files that
// count or list the Inbox must ask lib/inbox, not test `project_id` null on their
// own. A line that tests for "no project" for another reason carries the marker
// `inbox-rule-ok` with its reason. internal/inbox/guard_test.go checks the Go side.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const FILES = [
  'lib/views.ts', 'lib/listGroups.ts', 'lib/triage.ts', 'lib/review.ts', 'lib/method/pulse.ts',
  'app/task-list/useListModel.ts', 'app/Sidebar.tsx', 'app/TabBar.tsx', 'app/TriageView.tsx',
  'app/review/DailyCheck.tsx', 'app/method/LoopHome.tsx', 'app/calendar/PlanPanel.tsx',
]
const NO_PROJECT = /project_id\s*===?\s*null|!\s*\w+\.project_id\b/

describe('Inbox membership has one definition', () => {
  for (const file of FILES) {
    it(`${file} asks lib/inbox`, () => {
      const lines = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').split('\n')
      const bad = lines.map((l, i) => [i + 1, l] as const).filter(([, l]) => NO_PROJECT.test(l) && !l.includes('inbox-rule-ok'))
      expect(bad.map(([n, l]) => `${file}:${n}: ${l.trim()}`)).toEqual([])
    })
  }
})
