import { useState } from 'react'
import { SettingRow, SettingsSection } from '../ui'
import { Checkbox, Switch } from '../ui'
import {
  BUNDLED_LANGUAGES, loadQuickAddSettings, type QuickAddSettings, resolveLanguages, saveQuickAddSettings,
} from '../lib/nlp'
import { t, preferredLanguages } from '../lib/i18n'
import { cardCopy, rowCopy, SETTINGS_COPY } from '../lib/settingsCopy'

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', de: 'Deutsch', fr: 'Français', it: 'Italiano', es: 'Español', pt: 'Português',
}



/** Settings section for natural-language quick add; stored on this device only. */
export function QuickAddSettingsSection() {
  const [s, setS] = useState<QuickAddSettings>(loadQuickAddSettings)
  const update = (next: QuickAddSettings) => {
    setS(next)
    saveQuickAddSettings(next)
  }
  const browser = preferredLanguages()
  const active = resolveLanguages(s, browser)
  const followBrowser = s.languages === null

  function toggleLanguage(code: string, on: boolean) {
    const base = followBrowser ? active : s.languages ?? []
    const next = on ? [...base.filter((c) => c !== code), code] : base.filter((c) => c !== code)
    update({ ...s, languages: next.filter((c) => c !== 'en') })
  }

  return (
    <SettingsSection {...cardCopy('quick-add')}>
      <SettingRow label={rowCopy('quick-add', 'parse').label} description={
        <>{t.rich(SETTINGS_COPY['quick-add'].rows.parse.description, { project: <code>#project</code>, label: <code>@label</code>, p1: <code>p1</code>, p4: <code>p4</code>, estimate: <code>+30m</code> })}</>
      } control={<Switch checked={s.enabled} onChange={(on) => update({ ...s, enabled: on })} label={t('Parse natural language in quick add')} hideLabel />} />
      <fieldset disabled={!s.enabled} className="space-y-2 py-3 disabled:opacity-50">
        <legend className="text-body font-medium text-default">{t('Languages for dates and times')}</legend>
        <p className="text-meta text-muted">{t('English is always on.')}</p>
        <Checkbox label={t('Follow browser languages ({join})', { join: browser.join(', ') })} checked={followBrowser}
          onChange={(e) => update({ ...s, languages: e.target.checked ? null : active.filter((c) => c !== 'en') })} />
        <div className="flex flex-wrap gap-x-5 gap-y-1 pl-6">
          {BUNDLED_LANGUAGES.map((code) => (
            <Checkbox key={code} label={LANGUAGE_NAMES[code] ?? code} checked={active.includes(code)}
              disabled={code === 'en' || followBrowser} onChange={(e) => toggleLanguage(code, e.target.checked)} />
          ))}
        </div>
      </fieldset>
    </SettingsSection>
  )
}
