import { useState } from 'react'
import { Select } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import { Checkbox, Switch } from '../ui'
import {
  BUNDLED_LANGUAGES, dayMonthOrderSource, type DayMonthOrderSource, loadQuickAddSettings, type QuickAddSettings, resolveLanguages, saveQuickAddSettings,
} from '../lib/nlp'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { t, msg, translatedMap, preferredLanguages } from '../lib/i18n'

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', de: 'Deutsch', fr: 'Français', it: 'Italiano', es: 'Español', pt: 'Português',
}

const SOURCE = translatedMap<DayMonthOrderSource>({
  device: msg('set on this device'),
  'date-format': msg('from your date format'),
  language: msg('from your language'),
})

/** "Automatic: day-month, from your date format" (date-time-preferences D6). */
export function automaticOrderLabel(order: 'DM' | 'MD', source: DayMonthOrderSource): string {
  return t('Automatic: {order}, {source}', { order: order === 'DM' ? t('day-month') : t('month-day'), source: SOURCE[source] })
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
  // An automatic order follows the date format preference before the language (date-time-preferences D6).
  const { prefs } = useDateTimeFormat()
  const auto = dayMonthOrderSource({ ...s, dayMonthOrder: 'auto' }, browser, prefs)

  function toggleLanguage(code: string, on: boolean) {
    const base = followBrowser ? active : s.languages ?? []
    const next = on ? [...base.filter((c) => c !== code), code] : base.filter((c) => c !== code)
    update({ ...s, languages: next.filter((c) => c !== 'en') })
  }

  return (
    <SettingsSection title={t('Quick add')} headingId="quick-add-heading"
      description={t('How quick add reads what you type. Applies to this device only.')}>
      <SettingRow label={t('Parse natural language')} description={
        <>{t.rich('Dates and times (“tomorrow at 3pm”), {project}, {label}, {p1}–{p4} and estimates ({estimate}). Put text in "double quotes" to keep it literal.', { project: <code>#project</code>, label: <code>@label</code>, p1: <code>p1</code>, p4: <code>p4</code>, estimate: <code>+30m</code> })}</>
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
      <SettingRow label={t('Numeric dates like 12/11')} htmlFor="quickadd-order"
        description={s.dayMonthOrder === 'auto' ? undefined : t('Set on this device; it wins over your date format.')} control={
        <Select id="quickadd-order" className="sm:w-60" disabled={!s.enabled} value={s.dayMonthOrder}
          onChange={(e) => update({ ...s, dayMonthOrder: e.target.value as QuickAddSettings['dayMonthOrder'] })}>
          <option value="auto">{automaticOrderLabel(auto.order, auto.source)}</option>
          <option value="DM">{t('Day/month (12 November)')}</option>
          <option value="MD">{t('Month/day (December 11)')}</option>
        </Select>
      } />
    </SettingsSection>
  )
}
