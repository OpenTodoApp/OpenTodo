// Settings → Notifications → Routines (OpenSpec change routines-editor, spec
// routine-inbox "Hide successful runs"): the synced user_prefs.routines_hide_successes.
import { t } from '../../lib/i18n'
import { useUserPrefsRow } from '../../lib/localData'
import { hidesSuccesses, setHideSuccesses } from '../../lib/rules/inboxPrefs'
import { cardCopy, rowCopy } from '../../lib/settingsCopy'
import { SettingRow, SettingsSection, Switch } from '../../ui'
import { act } from '../actionError'

export function RoutineRunsView({ hide, onChange }: { hide: boolean; onChange: (on: boolean) => void }) {
  return (
    <SettingsSection {...cardCopy('routine-runs')}>
      <SettingRow {...rowCopy('routine-runs', 'hide')} id="routine-runs" htmlFor="routine-runs-switch"
        control={<span data-routine-runs-switch><Switch id="routine-runs-switch" checked={hide} onChange={onChange} label={t('Hide successful runs')} hideLabel /></span>} />
    </SettingsSection>
  )
}

export function RoutineRunsSection() {
  const row = useUserPrefsRow()
  return <RoutineRunsView hide={hidesSuccesses(row)} onChange={(on) => act(setHideSuccesses(on))} />
}
