// The assistant composer's microphone (OpenSpec change voice-ramble, design D2):
// long dictation with the recogniser this device chose for voice capture, offered
// only when voice capture is on and that recogniser can run here. The transcript
// goes into the composer's field as editable text; nothing is sent until the
// person sends. The engine is loaded lazily, with quick add's dictation engine.
import { type RefObject, useEffect, useRef, useState } from 'react'
import { loadQuickAddSettings, resolveLanguages } from '../../lib/nlp'
import { preferredLanguages, t } from '../../lib/i18n'
import type { Ramble, RambleView } from '../../lib/voice/ramble'
import { loadVoiceSettings, onVoiceSettingsChange, recognitionLanguage, recognitionTag } from '../../lib/voice/settings'
import { canRecord, useSpeechService } from '../../lib/voice/speechService'
import { isSupported } from '../../lib/voice/support'
import { useShortcutScope } from '../shortcuts'

const IDLE: RambleView = { status: 'idle', elapsedMs: 0, announcement: '', message: null }

/** The listening ramble, so the panel's Escape stops it before closing anything. */
const current: { ramble: Ramble | null } = { ramble: null }

/** Stops a listening ramble; reports whether one was listening. */
export function stopActiveRamble(): boolean {
  const r = current.ramble
  if (!r || r.status === 'idle') return false
  r.stop()
  return true
}

export interface RambleControl {
  /** Voice capture is on and its recogniser can run on this device. */
  enabled: boolean
  view: RambleView
  listening: boolean
  toggle: () => void
  start: () => void
  stop: () => void
  dismissMessage: () => void
}

/** Whether the device's voice capture can run here (quick add's rule, design D10). */
export function useVoiceAvailable(): boolean {
  const [voice, setVoice] = useState(loadVoiceSettings)
  useEffect(() => onVoiceSettingsChange(() => setVoice(loadVoiceSettings())), [])
  const service = useSpeechService(voice.enabled && voice.recognizer === 'server')
  const server = voice.recognizer === 'server' && service.connected && canRecord()
  return voice.enabled && (server || (voice.recognizer === 'browser' && isSupported()))
}

export function useRamble(opts: { getText: () => string; setText: (s: string) => void; fieldRef: RefObject<HTMLTextAreaElement | null>; offered: boolean }): RambleControl {
  const available = useVoiceAvailable()
  const enabled = opts.offered && available
  const server = loadVoiceSettings().recognizer === 'server'
  const [view, setView] = useState<RambleView>(IDLE)
  const latest = useRef(opts)
  latest.current = opts
  const ramble = useRef<Ramble | null>(null)
  const queued = useRef(false)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let r: Ramble | null = null
    void import('../../lib/voice/engine').then(({ createRamble, startLongRecognition, startServerPieces }) => {
      if (cancelled) return
      r = createRamble({
        getValue: () => latest.current.getText(),
        setValue: (v) => latest.current.setText(v),
        lang: () => {
          const langs = resolveLanguages(loadQuickAddSettings(), preferredLanguages())
          return recognitionTag(recognitionLanguage(loadVoiceSettings(), langs), preferredLanguages())
        },
        update: (v) => {
          setView(v)
          if (v.status === 'idle') {
            // Focus back in the field with the caret at the end.
            const el = latest.current.fieldRef.current
            if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) }
          }
        },
      }, server ? (o) => startServerPieces(o) : (o) => startLongRecognition(o))
      ramble.current = r
      current.ramble = r
      if (queued.current) { queued.current = false; r.start() }
    })
    return () => {
      cancelled = true
      r?.dispose()
      if (current.ramble === r) current.ramble = null
      ramble.current = null
      setView(IDLE)
    }
  }, [enabled, server])

  const listening = view.status !== 'idle'
  // Escape stops listening before any other Escape behaviour (as quick add's dictation).
  useShortcutScope('list', { 'list.dictate-stop': () => { ramble.current?.stop() } }, { capture: true, enabled: listening })

  const start = () => {
    if (!enabled) return
    if (ramble.current) ramble.current.start()
    else queued.current = true // the engine is still loading
  }
  return {
    enabled, view, listening, start,
    toggle: () => (listening ? ramble.current?.stop() : start()),
    stop: () => ramble.current?.stop(),
    dismissMessage: () => setView((v) => ({ ...v, message: null })),
  }
}

/** The announcement in the reader's language. */
export function rambleAnnouncement(v: RambleView): string {
  return v.announcement === 'Listening' ? t('Listening') : v.announcement === 'Stopped' ? t('Stopped') : v.announcement
}
