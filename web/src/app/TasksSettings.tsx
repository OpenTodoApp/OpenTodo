// Settings → General → Tasks (OpenSpec change keep-open-subtasks, design D1): one
// switch for what completing a parent does to its open subtasks. On (the default)
// completes them too; off keeps them open, out of lists and counts, in the parent's
// Subtasks. One synced user_prefs field, written as one op.
import { useUserPrefsRow } from '../lib/localData'
import { cardCopy, rowCopy } from '../lib/settingsCopy'
import { keepsOpenSubtasks } from '../lib/subtasks'
import { setKeepOpenSubtasks } from '../lib/userPrefs'
import { SettingRow, SettingsSection, Switch } from '../ui'
import { act } from './actionError'

export function TasksSection() {
  const keep = keepsOpenSubtasks(useUserPrefsRow())
  return <TasksView complete={!keep} onChange={(on) => act(setKeepOpenSubtasks(!on))} />
}

/** Presentational part of the card, rendered without data for tests and stories. */
export function TasksView({ complete, onChange }: { complete: boolean; onChange: (complete: boolean) => void }) {
  const row = rowCopy('tasks', 'completeSubtasks')
  return (
    <SettingsSection {...cardCopy('tasks')} testId="tasks-settings">
      <SettingRow id="tasks-complete-subtasks" label={row.label} htmlFor="tasks-complete-subtasks-switch"
        control={<Switch id="tasks-complete-subtasks-switch" checked={complete} onChange={onChange} label={row.label} hideLabel />} />
    </SettingsSection>
  )
}
