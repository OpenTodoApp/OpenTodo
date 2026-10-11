import { useState } from 'react'
import { HelpHeading } from './help/HelpLink'
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
    <section className="space-y-3">
      <HelpHeading screen="settings/quick-add" className="font-semibold">Quick add</HelpHeading>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5" checked={s.enabled} onChange={(e) => update({ ...s, enabled: e.target.checked })} />
        <span>
          Parse natural language in quick add
          <span className="block text-xs text-muted">
            Dates and times (“tomorrow at 3pm”), <code>#project</code>, <code>@label</code>, <code>p1</code>–<code>p4</code> and estimates
            (<code>+30m</code>). Put text in "double quotes" to keep it literal. Applies to this device only.
          </span>
        </span>
      </label>
      <fieldset disabled={!s.enabled} className="space-y-2 disabled:opacity-50">
        <legend className="text-sm text-slate-600 dark:text-slate-300">Languages for dates and times</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={followBrowser}
            onChange={(e) => update({ ...s, languages: e.target.checked ? null : active.filter((c) => c !== 'en') })}
          />
          Follow browser languages ({browser.join(', ')})
        </label>
        <div className="flex flex-wrap gap-x-4 gap-y-1 pl-6 text-sm">
          {BUNDLED_LANGUAGES.map((code) => (
            <label key={code} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={active.includes(code)}
                disabled={code === 'en' || followBrowser}
                onChange={(e) => toggleLanguage(code, e.target.checked)}
              />
              {LANGUAGE_NAMES[code] ?? code}
            </label>
          ))}
        </div>
        <p className="pl-6 text-xs text-faint">English is always on.</p>
        <label className="flex items-center gap-2 text-sm">
          Numeric dates like 12/11
          <select
            className="input w-auto py-1"
            value={s.dayMonthOrder}
            onChange={(e) => update({ ...s, dayMonthOrder: e.target.value as QuickAddSettings['dayMonthOrder'] })}
          >
            <option value="auto">Automatic ({order === 'DM' ? 'day/month' : 'month/day'})</option>
            <option value="DM">Day/month (12 November)</option>
            <option value="MD">Month/day (December 11)</option>
          </select>
        </label>
      </fieldset>
    </section>
  )
}
