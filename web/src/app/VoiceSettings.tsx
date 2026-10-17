import { useEffect, useState } from 'react'
import { keysOf } from '../lib/shortcuts'
import { Kbd } from './shortcuts/Kbd'
import { Button, Dialog } from '../ui'
import { Select } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import { Switch } from '../ui'
import { BUNDLED_LANGUAGES, loadQuickAddSettings, resolveLanguages } from '../lib/nlp'
import { loadVoiceSettings, onVoiceSettingsChange, saveVoiceSettings, type VoiceSettings } from '../lib/voice/settings'
import { isSupported } from '../lib/voice/support'
import { t, preferredLanguages } from '../lib/i18n'

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', de: 'Deutsch', fr: 'Français', it: 'Italiano', es: 'Español', pt: 'Português',
}

/** The privacy statement shown before voice capture can be switched on (spec "Privacy contract"). */
export function VoicePrivacyStatement() {
  return (
    <ul className="list-disc space-y-1 pl-5 text-body text-default">
      <li>{t('Speech is recognised by your browser, not by OpenTodo.')}</li>
      <li>{t('Depending on the browser, your audio may be sent to the browser vendor’s speech service (for example Google for Chrome, Apple for Safari) and handled under their privacy policy.')}</li>
      <li>{t('OpenTodo asks the browser to recognise speech on this device when it offers that choice.')}</li>
      <li>{t('Your OpenTodo server never receives audio or transcripts. Only the task you save with Enter is stored and synced, like a typed one.')}</li>
      <li>{t('The microphone is used only while you dictate; the browser asks for permission the first time.')}</li>
    </ul>
  )
}

/** Settings section for voice capture; stored on this device only, never synced. */
export function VoiceSettingsSection() {
  const [s, setS] = useState<VoiceSettings>(loadVoiceSettings)
  const [confirming, setConfirming] = useState(false)
  useEffect(() => onVoiceSettingsChange(() => setS(loadVoiceSettings())), [])
  const supported = isSupported()
  const update = (next: VoiceSettings) => {
    setS(next)
    saveVoiceSettings(next)
  }
  const browser = preferredLanguages()
  const followed = resolveLanguages(loadQuickAddSettings(), browser)[0] ?? 'en'

  return (
    <SettingsSection title={t('Voice capture')} headingId="voice-settings-heading"
      description={t('Speak a task instead of typing it. Applies to this device only.')}>
      <SettingRow label={t('Dictate tasks into quick add')} description={
        <span id="voice-settings-note">
          {supported
            ? <>{t.rich('A microphone button appears in quick add, and dictation also starts with {kbd}. Spoken words become quick-add text (“hashtag home priority two” → {example}); nothing is saved until you press Enter.', { kbd: <Kbd k={keysOf('list.dictate')} />, example: <code>#home p2</code> })}</>
            : t('This browser does not provide speech recognition, so voice capture is not available here. Typing works as usual.')}
        </span>
      } control={
        <Switch checked={supported && s.enabled} disabled={!supported} label={t('Dictate tasks into quick add')} hideLabel
          onChange={(on) => (on ? setConfirming(true) : update({ ...s, enabled: false }))} />
      } />
      {supported && s.enabled && (
        <SettingRow label={t('Recognition language')} htmlFor="voice-lang" control={
          <Select id="voice-lang" className="sm:w-56" value={s.lang ?? ''} onChange={(e) => update({ ...s, lang: e.target.value || null })}>
            <option value="">{t('Follow quick add ({language})', { language: LANGUAGE_NAMES[followed] ?? followed })}</option>
            {BUNDLED_LANGUAGES.map((code) => <option key={code} value={code}>{LANGUAGE_NAMES[code] ?? code}</option>)}
          </Select>
        } />
      )}
      {confirming && (
        <Dialog title={t('Turn on voice capture?')} onClose={() => setConfirming(false)} size="md">
          <VoicePrivacyStatement />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>{t('Cancel')}</Button>
            <Button variant="primary" data-autofocus onClick={() => { update({ ...s, enabled: true }); setConfirming(false) }}>{t('Turn on')}</Button>
          </div>
        </Dialog>
      )}
    </SettingsSection>
  )
}
