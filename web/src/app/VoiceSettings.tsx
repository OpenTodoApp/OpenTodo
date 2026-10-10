import { useEffect, useState } from 'react'
import { BUNDLED_LANGUAGES, loadQuickAddSettings, resolveLanguages } from '../lib/nlp'
import { loadVoiceSettings, onVoiceSettingsChange, saveVoiceSettings, type VoiceSettings } from '../lib/voice/settings'
import { isSupported } from '../lib/voice/support'

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', de: 'Deutsch', fr: 'Français', it: 'Italiano', es: 'Español', pt: 'Português',
}

/** The privacy statement shown before voice capture can be switched on (spec "Privacy contract"). */
export function VoicePrivacyStatement() {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
      <li>Speech is recognised by your browser, not by OpenTodo.</li>
      <li>Depending on the browser, your audio may be sent to the browser vendor’s speech service (for example Google for Chrome, Apple for Safari) and handled under their privacy policy.</li>
      <li>OpenTodo asks the browser to recognise speech on this device when it offers that choice.</li>
      <li>Your OpenTodo server never receives audio or transcripts. Only the task you save with Enter is stored and synced, like a typed one.</li>
      <li>The microphone is used only while you dictate; the browser asks for permission the first time.</li>
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
  const browser = navigator.languages?.length ? navigator.languages : [navigator.language || 'en']
  const followed = resolveLanguages(loadQuickAddSettings(), browser)[0] ?? 'en'

  useEffect(() => {
    if (!confirming) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setConfirming(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [confirming])

  return (
    <section className="space-y-3" aria-labelledby="voice-settings-heading">
      <h2 id="voice-settings-heading" className="font-semibold">Voice capture</h2>
      <label className={`flex items-start gap-2 text-sm ${supported ? '' : 'opacity-60'}`}>
        <input
          type="checkbox"
          className="mt-0.5"
          checked={supported && s.enabled}
          disabled={!supported}
          aria-describedby="voice-settings-note"
          onChange={(e) => (e.target.checked ? setConfirming(true) : update({ ...s, enabled: false }))}
        />
        <span>
          Dictate tasks into quick add
          <span id="voice-settings-note" className="block text-xs text-slate-500">
            {supported
              ? <>A microphone button appears in quick add, and <span className="kbd">Shift+V</span> starts dictation. Spoken words become quick-add text (“hashtag home priority two” → <code>#home p2</code>); nothing is saved until you press Enter. Applies to this device only.</>
              : 'This browser does not provide speech recognition, so voice capture is not available here. Typing works as usual.'}
          </span>
        </span>
      </label>
      {supported && s.enabled && (
        <label className="flex items-center gap-2 pl-6 text-sm">
          Recognition language
          <select className="input w-auto py-1" value={s.lang ?? ''} onChange={(e) => update({ ...s, lang: e.target.value || null })}>
            <option value="">Follow quick add ({LANGUAGE_NAMES[followed] ?? followed})</option>
            {BUNDLED_LANGUAGES.map((code) => <option key={code} value={code}>{LANGUAGE_NAMES[code] ?? code}</option>)}
          </select>
        </label>
      )}
      {confirming && (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/30 p-4 pt-24" onClick={() => setConfirming(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="voice-confirm-title" onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl dark:bg-slate-900">
            <h2 id="voice-confirm-title" className="mb-2 text-base font-semibold">Turn on voice capture?</h2>
            <VoicePrivacyStatement />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-ghost text-sm" onClick={() => setConfirming(false)}>Cancel</button>
              <button type="button" className="btn-primary text-sm" autoFocus onClick={() => { update({ ...s, enabled: true }); setConfirming(false) }}>
                Turn on
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
