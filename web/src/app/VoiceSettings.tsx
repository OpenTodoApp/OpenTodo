import { useEffect, useState } from 'react'
import { keysOf } from '../lib/shortcuts'
import { Kbd } from './shortcuts/Kbd'
import { Button, Dialog } from '../ui'
import { Select } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import { Switch } from '../ui'
import { BUNDLED_LANGUAGES, loadQuickAddSettings, resolveLanguages } from '../lib/nlp'
import { useEncryption } from '../lib/e2ee'
import { loadVoiceSettings, onVoiceSettingsChange, type Recognizer, saveVoiceSettings, type VoiceSettings } from '../lib/voice/settings'
import { canRecord, useSpeechService } from '../lib/voice/speechService'
import { isSupported } from '../lib/voice/support'
import { t, preferredLanguages } from '../lib/i18n'
import { cardCopy, rowCopy, SETTINGS_COPY } from '../lib/settingsCopy'

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

/**
 * The statement for the server's speech service (settings-refresh D7): where the
 * phrase goes, named by the service's host, and that nothing is kept.
 */
export function ServerSpeechStatement({ host, encrypted }: { host: string; encrypted: boolean }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-body text-default" data-server-speech-statement>
      <li>{t('Each phrase is recorded in this browser while the microphone is on, then sent once to your OpenTodo server.')}</li>
      <li>{t('The server passes it to the speech service the owner connected, {host}, and returns the text.', { host })}</li>
      <li>{t('Neither the server nor the app keeps the audio or the text. Only the task you save with Enter is stored and synced.')}</li>
      {encrypted && <li>{t('Your account is end-to-end encrypted: while the request runs, the phrase and its text are readable by this server and the speech service.')}</li>}
    </ul>
  )
}

/** What the confirmation dialog is about: switching on, or changing the recogniser. */
type Confirming = { recognizer: Recognizer; enable: boolean } | null

/** Settings section for voice capture; stored on this device only, never synced. */
/** The consent asked before voice capture turns on or changes recogniser (the statement of who hears the audio). */
export function VoiceConsentDialog({ confirming, host, encrypted, onCancel, onConfirm }: {
  confirming: NonNullable<Confirming>
  host: string
  encrypted: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog title={confirming.enable ? t('Turn on voice capture?') : t('Change who recognises speech?')} onClose={onCancel} size="md" testId="voice-statement">
      {confirming.recognizer === 'server' ? <ServerSpeechStatement host={host} encrypted={encrypted} /> : <VoicePrivacyStatement />}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>{t('Cancel')}</Button>
        <Button variant="primary" data-autofocus data-voice-confirm onClick={onConfirm}>
          {confirming.enable ? t('Turn on') : t('Use it')}
        </Button>
      </div>
    </Dialog>
  )
}

export function VoiceSettingsSection() {
  const [s, setS] = useState<VoiceSettings>(loadVoiceSettings)
  const [confirming, setConfirming] = useState<Confirming>(null)
  useEffect(() => onVoiceSettingsChange(() => setS(loadVoiceSettings())), [])
  const service = useSpeechService()
  const encrypted = useEncryption().enabled
  const serverOffered = service.connected && canRecord()
  const browserOk = isSupported()
  // A server choice without a connected service falls back to the browser's.
  const recognizer: Recognizer = s.recognizer === 'server' && serverOffered ? 'server' : 'browser'
  const supported = browserOk || serverOffered
  const update = (next: VoiceSettings) => {
    setS(next)
    saveVoiceSettings(next)
  }
  const browser = preferredLanguages()
  const followed = resolveLanguages(loadQuickAddSettings(), browser)[0] ?? 'en'
  const firstChoice: Recognizer = browserOk ? recognizer : 'server'

  return (
    <SettingsSection {...cardCopy('voice-settings')}>
      <SettingRow label={rowCopy('voice-settings', 'dictate', { variant: 'supported' }).label} description={
        <span id="voice-settings-note">
          {supported
            ? <>{t.rich(SETTINGS_COPY['voice-settings'].rows.dictate.description.supported, { kbd: <Kbd k={keysOf('list.dictate')} /> })}</>
            : rowCopy('voice-settings', 'dictate', { variant: 'unsupported' }).description}
        </span>
      } control={
        <Switch checked={supported && s.enabled} disabled={!supported} label={t('Dictate tasks into quick add')} hideLabel
          onChange={(on) => (on ? setConfirming({ recognizer: firstChoice, enable: true }) : update({ ...s, enabled: false }))} />
      } />
      {supported && s.enabled && serverOffered && (
        <SettingRow {...rowCopy('voice-settings', 'recognizer')} htmlFor="voice-recognizer" control={
          <Select id="voice-recognizer" className="sm:w-64" value={recognizer}
            onChange={(e) => setConfirming({ recognizer: e.target.value as Recognizer, enable: false })}>
            {browserOk && <option value="browser">{t('This browser')}</option>}
            <option value="server">{t('This server’s speech service ({host})', { host: service.host ?? '' })}</option>
          </Select>
        } />
      )}
      {supported && s.enabled && (
        <SettingRow {...rowCopy('voice-settings', 'lang')} htmlFor="voice-lang" control={
          <Select id="voice-lang" className="sm:w-56" value={s.lang ?? ''} onChange={(e) => update({ ...s, lang: e.target.value || null })}>
            <option value="">{t('Follow quick add ({language})', { language: LANGUAGE_NAMES[followed] ?? followed })}</option>
            {BUNDLED_LANGUAGES.map((code) => <option key={code} value={code}>{LANGUAGE_NAMES[code] ?? code}</option>)}
          </Select>
        } />
      )}
      {confirming && (
        <VoiceConsentDialog confirming={confirming} host={service.host ?? ''} encrypted={encrypted} onCancel={() => setConfirming(null)}
          onConfirm={() => { update({ ...s, enabled: true, recognizer: confirming.recognizer }); setConfirming(null) }} />
      )}
    </SettingsSection>
  )
}
