import { useState } from 'react'
import { Select } from '../ui/Field'
import { SettingRow, SettingsSection } from '../ui/patterns/SettingsSection'
import { Checkbox, Switch } from '../ui/Switch'
import {
  BUNDLED_LANGUAGES, loadQuickAddSettings, type QuickAddSettings, resolveDayMonthOrder, resolveLanguages, saveQuickAddSettings,
} from '../lib/nlp'

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', de: 'Deutsch', fr: 'Français', it: 'Italiano', es: 'Español', pt: 'Português',
}

function browserLanguages(): readonly string[] {
  return navigator.languages?.length ? navigator.languages : [navigator.language || 'en']
}

/** Settings section for natural-language quick add; stored on this device only. */
export function QuickAddSettingsSection() {
  const [s, setS] = useState<QuickAddSettings>(loadQuickAddSettings)
  const update = (next: QuickAddSettings) => {
    setS(next)
    saveQuickAddSettings(next)
  }
  const browser = browserLanguages()
  const active = resolveLanguages(s, browser)
  const followBrowser = s.languages === null
  const order = resolveDayMonthOrder(s, browser)

  function toggleLanguage(code: string, on: boolean) {
    const base = followBrowser ? active : s.languages ?? []
    const next = on ? [...base.filter((c) => c !== code), code] : base.filter((c) => c !== code)
    update({ ...s, languages: next.filter((c) => c !== 'en') })
  }

  return (
    <SettingsSection title="Quick add" helpId="settings/quick-add" headingId="quick-add-heading"
      description="How quick add reads what you type. Applies to this device only.">
      <SettingRow label="Parse natural language" description={
        <>Dates and times (“tomorrow at 3pm”), <code>#project</code>, <code>@label</code>, <code>p1</code>–<code>p4</code> and estimates
          (<code>+30m</code>). Put text in "double quotes" to keep it literal.</>
      } control={<Switch checked={s.enabled} onChange={(on) => update({ ...s, enabled: on })} label="Parse natural language in quick add" hideLabel />} />
      <fieldset disabled={!s.enabled} className="space-y-2 py-3 disabled:opacity-50">
        <legend className="text-sm font-medium text-default">Languages for dates and times</legend>
        <p className="text-meta text-muted">English is always on.</p>
        <Checkbox label={`Follow browser languages (${browser.join(', ')})`} checked={followBrowser}
          onChange={(e) => update({ ...s, languages: e.target.checked ? null : active.filter((c) => c !== 'en') })} />
        <div className="flex flex-wrap gap-x-5 gap-y-1 pl-6">
          {BUNDLED_LANGUAGES.map((code) => (
            <Checkbox key={code} label={LANGUAGE_NAMES[code] ?? code} checked={active.includes(code)}
              disabled={code === 'en' || followBrowser} onChange={(e) => toggleLanguage(code, e.target.checked)} />
          ))}
        </div>
      </fieldset>
      <SettingRow label="Numeric dates like 12/11" htmlFor="quickadd-order" control={
        <Select id="quickadd-order" className="sm:w-60" disabled={!s.enabled} value={s.dayMonthOrder}
          onChange={(e) => update({ ...s, dayMonthOrder: e.target.value as QuickAddSettings['dayMonthOrder'] })}>
          <option value="auto">Automatic ({order === 'DM' ? 'day/month' : 'month/day'})</option>
          <option value="DM">Day/month (12 November)</option>
          <option value="MD">Month/day (December 11)</option>
        </Select>
      } />
    </SettingsSection>
  )
}
