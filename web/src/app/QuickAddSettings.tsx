import { useState } from 'react'
import { SettingRow, SettingsSection } from '../ui'
import { Checkbox, RadioGroup, Switch } from '../ui'
import {
  BUNDLED_LANGUAGES, loadQuickAddSettings, type QuickAddSettings, resolveLanguages, saveQuickAddSettings,
} from '../lib/nlp'
import { languageName } from '../locales'
import { t, msg, preferredLanguages, translatedMap } from '../lib/i18n'
import { cardCopy, rowCopy, SETTINGS_COPY } from '../lib/settingsCopy'
import { useUserPrefsRow } from '../lib/localData'
import { type AddPositionPref, readAddPosition, setAddPosition } from '../lib/userPrefs'
import { act } from './actionError'

const ADD_POSITIONS: readonly AddPositionPref[] = ['bottom', 'top']
const ADD_POSITION_LABEL = translatedMap<AddPositionPref>({ bottom: msg('At the bottom of the list'), top: msg('At the top of the list') })

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
            <Checkbox key={code} label={languageName(code)} checked={active.includes(code)}
              disabled={code === 'en' || followBrowser} onChange={(e) => toggleLanguage(code, e.target.checked)} />
          ))}
        </div>
      </fieldset>
    </SettingsSection>
  )
}

/** Settings → Capture → Quick add → New tasks (add-position D1): the synced choice, written through ops. */
export function AddPositionSection() {
  const value = readAddPosition(useUserPrefsRow())
  return <AddPositionView value={value} onChange={(v) => act(setAddPosition(v))} />
}

export function AddPositionView({ value, onChange }: { value: AddPositionPref; onChange: (v: AddPositionPref) => void }) {
  const copy = rowCopy('add-position', 'place')
  return (
    <SettingsSection {...cardCopy('add-position')}>
      <div id="add-position" tabIndex={-1} data-setting-row="add-position" className="py-3 outline-none focus-visible:rounded-control focus-visible:ring-2 focus-visible:ring-focus">
        <p className="text-body font-medium text-default" aria-hidden="true">{copy.label}</p>
        <p className="mt-0.5 text-meta text-muted">{copy.description}</p>
        <div className="mt-2" data-testid="add-position">
          <RadioGroup label={copy.label} hideLabel variant="list" name="add-position" value={value} onChange={onChange}
            options={ADD_POSITIONS.map((p) => ({ value: p, label: ADD_POSITION_LABEL[p] }))} />
        </div>
      </div>
    </SettingsSection>
  )
}
