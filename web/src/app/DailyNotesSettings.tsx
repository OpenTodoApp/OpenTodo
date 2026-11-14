// Settings → General → Notes (OpenSpec change daily-notes, screen id
// settings/notes): Daily notes on or off, the project new daily notes go to and
// their template (the built-in Daily, none, or one of the user's templates).
// Three synced user_prefs fields, written as one op each and applied at once,
// offline included.
import { useProjects, useUserPrefsRow } from '../lib/localData'
import { useNoteRows } from '../lib/noteRows'
import { mutate } from '../lib/ops'
import { cardCopy, rowCopy } from '../lib/settingsCopy'
import { t } from '../lib/i18n'
import type { Note, Project, UserPrefs } from '../lib/types'
import { USER_PREFS_ID } from '../lib/userPrefs'
import { Select, SettingRow, SettingsSection, Switch } from '../ui'
import { act } from './actionError'
import { ProjectPickerField } from './ProjectPickerField'

type Prefs = Pick<UserPrefs, 'daily_notes' | 'daily_notes_project' | 'daily_notes_template'>

const write = (patch: Partial<Prefs>) => act(mutate('user_prefs', USER_PREFS_ID, patch))

export function DailyNotesSection() {
  const prefs = useUserPrefsRow()
  const projects = useProjects()
  const notes = useNoteRows()
  return <DailyNotesView prefs={prefs ?? {}} projects={projects} templates={notes.filter((n) => n.template && !n.deleted_at)} onChange={write} />
}

/** Presentational part of the card, rendered without data for tests and stories. */
export function DailyNotesView({ prefs, projects, templates, onChange }: {
  prefs: Partial<Prefs>
  projects: readonly Project[]
  templates: readonly Pick<Note, 'id' | 'title'>[]
  onChange: (patch: Partial<Prefs>) => void
}) {
  const on = prefs.daily_notes === true
  const template = prefs.daily_notes_template ?? ''
  // A template that is gone still shows as chosen; the note is made from the built-in Daily (spec "Template removed").
  const known = template === '' || template === 'none' || templates.some((n) => n.id === template)
  return (
    <SettingsSection {...cardCopy('daily-notes')} testId="daily-notes-settings">
      <SettingRow htmlFor="daily-notes-switch" {...rowCopy('daily-notes', 'enabled')}
        control={<span data-daily-notes-switch><Switch id="daily-notes-switch" checked={on} onChange={(v) => onChange({ daily_notes: v })} label={t('Daily notes')} hideLabel /></span>} />
      {on && (
        <>
          <SettingRow {...rowCopy('daily-notes', 'project')}
            control={<div className="sm:w-64" data-daily-notes-project><ProjectPickerField label={t('Project for daily notes')} projects={projects as Project[]} value={prefs.daily_notes_project || null} inbox={false} noneLabel={t('No project')} rankContext="note.project"
              onChange={(id) => onChange({ daily_notes_project: id ?? '' })} /></div>} />
          <SettingRow htmlFor="daily-notes-template" {...rowCopy('daily-notes', 'template')}
            control={
              <Select id="daily-notes-template" className="sm:w-64" value={template} data-daily-notes-template onChange={(e) => onChange({ daily_notes_template: e.target.value })}>
                <option value="">{t('Daily (built in)')}</option>
                <option value="none">{t('No template')}</option>
                {templates.map((n) => <option key={n.id} value={n.id}>{n.title.trim() || t('Untitled note')}</option>)}
                {!known && <option value={template}>{t('A template in the Trash')}</option>}
              </Select>
            } />
        </>
      )}
    </SettingsSection>
  )
}
