// Settings → Server → Automations (OpenSpec change automation-rules, "Switches"):
// the owner's switch for every account's rules, read-only and naming the variable
// when OPENTODO_AUTOMATIONS sets it.
import { useEffect, useState } from 'react'
import { api, isNetworkError } from '../../lib/api'
import { t } from '../../lib/i18n'
import { cardCopy } from '../../lib/settingsCopy'
import type { AutomationsSetting } from '../../lib/types'
import { Notice, SettingsSection, Switch } from '../../ui'
import { act } from '../actionError'
import { messageOf } from '../../lib/errorText'

export function AutomationsServerPanel() {
  const [s, setS] = useState<AutomationsSetting | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.automationsSwitch.get().then(setS, (err: unknown) =>
      setError(isNetworkError(err) ? t('Connect to change this setting.') : messageOf(err)))
  }, [])
  const save = (enabled: boolean) => act(api.automationsSwitch.put(enabled).then(setS))
  return (
    <SettingsSection {...cardCopy('automations-server')} id="automations">
      {s && (
        <div className="mt-3" data-automations-server>
          <Switch label={t('Run automation rules')} checked={s.enabled} disabled={s.locked}
            description={s.locked ? t('Set by {variable}', { variable: s.locked_by }) : undefined} onChange={save} />
        </div>
      )}
      {error && <div className="mt-3"><Notice tone="danger">{error}</Notice></div>}
    </SettingsSection>
  )
}
