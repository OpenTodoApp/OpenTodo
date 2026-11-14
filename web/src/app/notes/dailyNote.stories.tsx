// Daily notes (OpenSpec change daily-notes): Settings › General › Notes and the day's draft.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { mutate } from '../../lib/ops'
import { setCurrentUserId } from '../../lib/sharing'
import { USER_PREFS_ID } from '../../lib/userPrefs'
import { DailyNotesView } from '../DailyNotesSettings'
import { HEX, TODAY, project, withClock, withSeed } from '../stories/fixtures'
import { DailyNotePanel, DraftBody } from './DailyNote'

const meta: Meta = { title: 'Screens/Daily notes' }
export default meta

const journal = project({ id: 'p-journal', name: 'Journal', color: HEX.teal })
const templates = [{ id: 'n-weekly', title: 'Weekly review' }, { id: 'n-standup', title: 'Stand-up' }]
const settings = (prefs: Parameters<typeof DailyNotesView>[0]['prefs']) => (
  <div className="max-w-2xl"><DailyNotesView prefs={prefs} projects={[journal]} templates={templates} onChange={() => {}} /></div>
)

export const SettingsOff: StoryObj = { decorators: [withClock], render: () => settings({ daily_notes: false }) }
export const SettingsOn: StoryObj = { decorators: [withClock], render: () => settings({ daily_notes: true, daily_notes_project: journal.id, daily_notes_template: 'n-standup' }) }

const draft = { title: 'Wednesday 14/10/2026', description: '## Plan\n\n- \n\n## Notes\n\n- \n\n## What I finished today\n\n- ', labels: [] }
export const Draft: StoryObj = {
  decorators: [withClock],
  render: () => <div className="max-w-xl"><h2 className="user-text px-1 py-1 text-h3 font-semibold text-strong">{draft.title}</h2><DraftBody day={TODAY} draft={draft} /></div>,
}

export const Panel: StoryObj = {
  ...withSeed(async () => {
    await setCurrentUserId('u-ada')
    await mutate('user_prefs', USER_PREFS_ID, { daily_notes: true })
  }),
  render: () => <div className="h-[560px] max-w-2xl"><DailyNotePanel day={TODAY} /></div>,
}
