import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { type LabelRef, type ProjectRef, resolveLanguages, type QuickAddSettings } from '../lib/nlp'
import type { Dictation, DictationView } from '../lib/voice/dictation'
import { loadVoiceSettings, onVoiceSettingsChange, recognitionLanguage, recognitionTag } from '../lib/voice/settings'
import { isSupported } from '../lib/voice/support'
import { useShortcutScope } from './shortcuts'

function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return ['en']
  return navigator.languages?.length ? navigator.languages : [navigator.language || 'en']
}

function languageName(tag: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(tag) ?? tag
  } catch {
    return tag
  }
}

const IDLE: DictationView = { status: 'idle', announcement: '', message: null }

/**
 * Voice dictation for one quick-add input (OpenSpec `voice-capture`). Off unless the
 * per-device setting is on and the browser has speech recognition. The transcript is
 * written through `setText`, the same path as typing, so parsing and chips apply;
 * nothing is ever submitted from here.
 */
export function useDictation(opts: {
  inputRef: RefObject<HTMLInputElement | null>
  getText: () => string
  setText: (next: string) => void
  settings: QuickAddSettings
  projects: readonly ProjectRef[]
  labels: readonly LabelRef[]
  /** Listen for the global Shift+V shortcut (only the main quick add of a view). */
  shortcut?: boolean
}) {
  const [voice, setVoice] = useState(loadVoiceSettings)
  useEffect(() => onVoiceSettingsChange(() => setVoice(loadVoiceSettings())), [])
  const enabled = voice.enabled && isSupported()
  const [view, setView] = useState<DictationView>(IDLE)
  const latest = useRef(opts)
  latest.current = opts
  const voiceRef = useRef(voice)
  voiceRef.current = voice
  const caret = useRef<number | null>(null)
  const dictation = useRef<Dictation | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let d: Dictation | null = null
    // The engine is a separate chunk, loaded only when voice capture is on (D7).
    void import('../lib/voice/engine').then(({ createDictation, normalizeSpoken }) => {
      if (cancelled) return
      d = createDictation({
        getValue: () => latest.current.getText(),
        getSelection: () => {
          const el = latest.current.inputRef.current
          const len = latest.current.getText().length
          return { start: el?.selectionStart ?? len, end: el?.selectionEnd ?? len }
        },
        setValue: (value, at) => {
          caret.current = at
          latest.current.setText(value)
        },
        normalize: (text) => {
          const o = latest.current
          const langs = resolveLanguages(o.settings, browserLanguages())
          return normalizeSpoken(text, [recognitionLanguage(voiceRef.current, langs), ...langs], { projects: o.projects, labels: o.labels })
        },
        lang: () => {
          const langs = resolveLanguages(latest.current.settings, browserLanguages())
          return recognitionTag(recognitionLanguage(voiceRef.current, langs), browserLanguages())
        },
        languageName,
        update: setView,
      })
      dictation.current = d
    })
    return () => {
      cancelled = true
      d?.dispose()
      dictation.current = null
      setView(IDLE)
    }
  }, [enabled])

  // Keep the caret where the dictation put it after React re-renders the input.
  useLayoutEffect(() => {
    if (caret.current === null) return
    const el = opts.inputRef.current
    if (el) {
      el.focus()
      el.setSelectionRange(caret.current, caret.current)
    }
    caret.current = null
  })

  const active = view.status !== 'idle'

  // Escape stops listening before any other Escape behaviour (closing panels, blurring): a capturing frame.
  useShortcutScope('list', { 'list.dictate-stop': () => { dictation.current?.stop() } }, { capture: true, enabled: active })

  // Shift+V outside text fields starts dictation into this quick add.
  useShortcutScope('list', { 'list.dictate': () => { start() } }, { enabled: enabled && !!opts.shortcut })

  function start() {
    const el = latest.current.inputRef.current
    if (el && document.activeElement !== el) {
      el.focus()
      const end = el.value.length
      el.setSelectionRange(end, end)
    }
    dictation.current?.start()
  }

  return {
    enabled,
    view,
    listening: active,
    toggle: () => (active ? dictation.current?.stop() : start()),
    dismissMessage: () => dictation.current?.dismissMessage(),
  }
}
