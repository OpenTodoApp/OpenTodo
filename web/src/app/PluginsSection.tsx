// Settings → Plugins (OpenSpec change plugin-section, plugins "The Plugins
// settings section"): every built-in plugin with its one-line description and an
// enable switch. The switches read and write `user_prefs.disabled_plugins`
// through the operation log, so they work offline and follow the account to its
// other devices (design D3).
import { useUserPrefsRow } from '../lib/localData'
import { readDisabledPlugins, setPluginEnabled } from '../lib/plugins'
import { t } from '../lib/i18n'
import { cardCopy } from '../lib/settingsCopy'
import { SettingRow, SettingsSection, Switch } from '../ui'
import { PLUGINS } from '../plugins/registry'

export function PluginsSection() {
  const prefs = useUserPrefsRow()
  const disabled = readDisabledPlugins(prefs)
  return (
    <SettingsSection {...cardCopy('plugins')}>
      {PLUGINS.map((p) => (
        <SettingRow key={p.id} id={`plugin-${p.id}`} label={p.name} description={p.description}
          control={
            <Switch id={`plugin-${p.id}-switch`} checked={!disabled.has(p.id)} onChange={(on) => void setPluginEnabled(p.id, on)}
              label={t('Use {plugin}', { plugin: p.name })} hideLabel />
          } />
      ))}
    </SettingsSection>
  )
}
