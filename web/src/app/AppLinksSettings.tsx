// Settings → Integrations → Links to other apps (OpenSpec change app-links, D1,
// screen id settings/app-links): the person's own list of URL schemes whose links
// open in other apps, empty by default, one synced user_prefs value. A denied or
// malformed scheme is refused with a message; nothing here opens anything.
import { type FormEvent, useState } from 'react'
import { appLinkSchemesValue, MAX_APP_LINK_SCHEMES, normaliseSchemeEntry, readAppLinkSchemes, schemeEntryProblem } from '../lib/appLinks'
import { useEncryption } from '../lib/e2ee'
import { useUserPrefsRow } from '../lib/localData'
import { mutate } from '../lib/ops'
import { cardCopy, noticeCopy } from '../lib/settingsCopy'
import { t } from '../lib/i18n'
import { USER_PREFS_ID } from '../lib/userPrefs'
import { Button, IconButton, Input, SettingRow, SettingsSection } from '../ui'
import { act } from './actionError'

const save = (list: readonly string[]) => mutate('user_prefs', USER_PREFS_ID, { app_link_schemes: appLinkSchemesValue(list) })

export function AppLinksSection() {
  const enc = useEncryption()
  const list = readAppLinkSchemes(useUserPrefsRow(), enc.enabled && !enc.unlocked)
  return <AppLinksView list={list} onChange={(next) => act(save(next))} />
}

/** Presentational part of the card, rendered without data for tests and stories. */
export function AppLinksView({ list, onChange }: { list: readonly string[]; onChange: (next: string[]) => void }) {
  const [text, setText] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const add = (e: FormEvent) => {
    e.preventDefault()
    const entry = normaliseSchemeEntry(text)
    const why = schemeEntryProblem(entry, list)
    if (why) {
      setProblem(noticeCopy('app-links', why, { values: { n: MAX_APP_LINK_SCHEMES } }))
      return
    }
    onChange([...list, entry])
    setText('')
    setProblem(null)
  }
  return (
    <SettingsSection {...cardCopy('app-links')} testId="app-links-settings">
      {list.map((s) => (
        <SettingRow key={s} label={<span className="font-mono">{s}:</span>} control={
          <IconButton icon="x" size="sm" label={t('Remove {scheme}', { scheme: s })} onClick={() => onChange(list.filter((x) => x !== s))} data-app-link-remove={s} />
        } />
      ))}
      <form onSubmit={add} noValidate>
        <SettingRow htmlFor="app-link-add" label={t('Add an app')} status={problem ? <span role="alert" className="text-meta text-danger" data-app-link-problem>{problem}</span> : undefined}
          control={
            <span className="flex gap-2">
              <Input id="app-link-add" className="max-sm:min-h-11 sm:w-48" value={text} placeholder="zotero" autoComplete="off" spellCheck={false} data-app-link-input
                onChange={(e) => { setText(e.target.value); setProblem(null) }} />
              <Button type="submit" size="sm" variant="secondary" className="max-sm:min-h-11" data-app-link-add>{t('Add')}</Button>
            </span>
          } />
      </form>
    </SettingsSection>
  )
}
