// Settings → General panels (OpenSpec settings-navigation, settings-redesign D3).
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { readLanguage, setUserPref, USER_PREFS_ID } from '../lib/userPrefs'
import type { LanguagePref } from '../lib/types'
import { SHIPPED, nativeName } from '../locales'
import { Notice } from '../ui'
import { useLanguageStatus, type LanguageStatus } from './LanguageProvider'
import { Select } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import { Switch } from '../ui'
import { DISPLAY_START_VIEWS, setStartView, type StartView } from '../lib/views'
import type { View } from '../lib/types'
import { useStartView, useViews } from './useViews'
import { setVimEnabled, useVimEnabled } from './vim/prefs'
import { setShortcutHints, useShortcutHints } from './shortcuts/hints'
import { Kbd } from './shortcuts/Kbd'
import { resolveLanguage, t } from '../lib/i18n'

/** Settings → General → Language (OpenSpec app-localization, design D9): synced, applied without a reload. */
export function LanguageSection() {
  const row = useLiveQuery(() => db.userPrefs.get(USER_PREFS_ID), [])
  const status = useLanguageStatus()
  return <LanguageView value={readLanguage(row)} system={nativeName(resolveLanguage('system'))} status={status}
    onChange={(v) => void setUserPref('language', v)} />
}

/** Presentational part of the Language panel, rendered without effects for tests and stories. */
export function LanguageView({ value, system, status = 'ready', onChange }: {
  value: LanguagePref
  /** The language `System` resolves to, in its own name. */
  system: string
  status?: LanguageStatus
  onChange: (v: LanguagePref) => void
}) {
  return (
    <SettingsSection title={t('Language')} headingId="language-heading"
      description={t('The language of the app on all your devices. Your tasks are not translated.')}>
      <SettingRow label={t('Interface language')} htmlFor="language-select" control={
        <Select id="language-select" className="sm:w-56" value={value} onChange={(e) => onChange(e.target.value as LanguagePref)}>
          <option value="system">{t('System ({language})', { language: system })}</option>
          {SHIPPED.map((l) => <option key={l.code} value={l.code} lang={l.code}>{l.name}</option>)}
        </Select>
      } />
      {status === 'loading' && <p className="pt-2 text-meta text-muted" role="status" data-language-status="loading">{t('Loading the language…')}</p>}
      {status === 'failed' && (
        <div className="pt-2" data-language-status="failed">
          <Notice tone="danger">{t('The language could not be loaded on this device. Your choice is saved and applies as soon as it can be loaded, for example when you are back online.')}</Notice>
        </div>
      )}
    </SettingsSection>
  )
}

export function StartViewSection() {
  const views = useViews()
  const startView = useStartView()
  return <StartViewView views={views} startView={startView} onChange={(v) => void setStartView(v)} />
}

/** Presentational part of the start view setting, rendered without effects for tests and stories. */
export function StartViewView({ views, startView, onChange }: { views: View[]; startView: StartView; onChange: (v: StartView) => void }) {
  const startIsKnown = !startView.startsWith('view:') || views.some((v) => `view:${v.id}` === startView)
  // A display pinned from the display itself (a project, a saved view, other options) is listed while it is the start view.
  const pinnedDisplay = startView.startsWith('display:') && !DISPLAY_START_VIEWS.some((d) => d.value === startView) ? startView : null
  return (
    <SettingsSection title={t('Start view')} headingId="start-view-heading"
      description={t('The view this device opens on launch. Each device keeps its own choice; it is not synced.')}>
      <SettingRow label={t('Open on launch')} htmlFor="start-view-select" control={
        <Select id="start-view-select" className="sm:w-56" aria-label={t('Start view on this device')} value={startIsKnown ? startView : 'inbox'}
          onChange={(e) => onChange(e.target.value as StartView)}>
          <optgroup label={t('Built-in')}>
            <option value="inbox">{t('Inbox')}</option>
            <option value="today">{t('Today')}</option>
            <option value="upcoming">{t('Upcoming')}</option>
            <option value="completed">{t('Completed')}</option>
            <option value="filter">{t('Filter')}</option>
          </optgroup>
          {views.length > 0 && (
            <optgroup label={t('Saved views')}>
              {views.map((v) => <option key={v.id} value={`view:${v.id}`}>{v.name}</option>)}
            </optgroup>
          )}
          {/* Display mode (display-mode D6): opens full screen in large type. */}
          <optgroup label={t('Display mode')}>
            {DISPLAY_START_VIEWS.map((d) => <option key={d.value} value={d.value}>{t(d.label)}</option>)}
            {pinnedDisplay && <option value={pinnedDisplay}>{t('Display pinned on this device')}</option>}
          </optgroup>
        </Select>
      } />
    </SettingsSection>
  )
}

/** Keyboard switches: Vim keybindings (vim-keybindings) and "Show shortcut hints" (keyboard-shortcuts), both per device, applied at once. */
export function KeyboardSection() {
  const vim = useVimEnabled()
  const hints = useShortcutHints()
  return <KeyboardView vim={vim} onVim={setVimEnabled} hints={hints} onHints={setShortcutHints} />
}

export function KeyboardView({ vim, onVim, hints = false, onHints = () => {} }: { vim: boolean; onVim: (on: boolean) => void; hints?: boolean; onHints?: (on: boolean) => void }) {
  return (
    <SettingsSection title={t('Keyboard')} headingId="keyboard-heading"
      description={t('Every action has a shortcut; press ? anywhere to list them.')}>
      <SettingRow label={t('Show shortcut hints')} id="shortcut-hints" description={t('Print the keys in the app itself (next to quick add, in prompts and section headers) as well as in tooltips and menus. This device only.')}
        control={<span data-hints-switch><Switch checked={hints} onChange={onHints} label={t('Show shortcut hints (this device)')} hideLabel /></span>} />
      <SettingRow label={t('Vim keybindings')} description={
        <>{t.rich('Normal, Insert and Command modes on top of the usual shortcuts: counts, {kbd}, {kbd2}, {kbd3} commands. This device only.', { kbd: <Kbd k="gg" />, kbd2: <Kbd k="dd" />, kbd3: <Kbd k=":" /> })}</>
      } control={<span data-vim-switch><Switch checked={vim} onChange={onVim} label={t('Vim keybindings (this device)')} hideLabel /></span>} />
    </SettingsSection>
  )
}
