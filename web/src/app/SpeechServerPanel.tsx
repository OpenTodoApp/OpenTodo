// Settings → Server → Speech to text (OpenSpec change settings-refresh, design
// D7 and D8; voice-capture "Server speech service"): the owner connects one
// OpenAI-compatible transcription endpoint. The key is never shown; a field set
// by a variable is read-only and names it. Test sends a built-in second of
// silence and shows the text, or the stage that failed.
import { useEffect, useState, type FormEvent } from 'react'
import { api, ApiError, isNetworkError } from '../lib/api'
import { errorMessage } from '../lib/i18n/errors'
import { t } from '../lib/i18n'
import { cardCopy, noticeCopy } from '../lib/settingsCopy'
import type { SpeechSettings, SpeechSettingsInput } from '../lib/types'
import { setSpeechService } from '../lib/voice/speechService'
import { Button, Field, Input, Notice, SettingsSection } from '../ui'

const VARIABLE = { url: 'OPENTODO_STT_URL', model: 'OPENTODO_STT_MODEL', key: 'OPENTODO_STT_KEY_FILE' } as const

function failure(err: unknown): string {
  if (isNetworkError(err)) return t('Connect to change this setting.')
  return err instanceof ApiError ? errorMessage(err.code, err.message) : String(err)
}

/** The outcome of a Test: the sample's text, or why it failed. */
export type SpeechTestResult = { ok: true; text: string } | { ok: false; error: string }

export interface SpeechServerViewProps {
  settings: SpeechSettings
  onSave: (input: SpeechSettingsInput) => Promise<void>
  onTest: (draft: SpeechSettingsInput) => Promise<SpeechTestResult>
}

/** The form, without loading, for tests and stories. */
export function SpeechServerView({ settings, onSave, onTest }: SpeechServerViewProps) {
  const [url, setUrl] = useState(settings.url)
  const [model, setModel] = useState(settings.model)
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SpeechTestResult | null>(null)
  const locked = (f: keyof typeof VARIABLE) => settings.locked.includes(f)
  const draft = (): SpeechSettingsInput => ({
    ...(locked('url') ? {} : { url }), ...(locked('model') ? {} : { model }), ...(locked('key') || !key ? {} : { key }),
  })
  const save = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await onSave(draft())
      setKey('')
    } catch (err) {
      setError(failure(err))
    }
  }
  const test = async () => {
    setResult(null)
    try { setResult(await onTest(draft())) } catch (err) { setResult({ ok: false, error: failure(err) }) }
  }
  const note = (f: keyof typeof VARIABLE, normal?: string) => (locked(f) ? t('Set by {variable}', { variable: VARIABLE[f] }) : normal)
  return (
    <form className="mt-3 space-y-4" onSubmit={(e) => void save(e)} data-speech-server>
      <Field label={t('Service address')} description={note('url', t('For example http://stt.home.lan:8000 (Speaches or whisper.cpp).'))}>
        <Input type="url" value={url} readOnly={locked('url')} placeholder={t('http://stt.home.lan:8000')} onChange={(e) => setUrl(e.target.value)} data-speech-field="url" />
      </Field>
      <Field label={t('Model')} description={note('model', t('For example Systran/faster-whisper-small.'))}>
        <Input value={model} readOnly={locked('model')} onChange={(e) => setModel(e.target.value)} data-speech-field="model" />
      </Field>
      <Field label={t('Key')} description={note('key', settings.keySet ? t('A key is set. Type a new one to replace it.') : t('Only if the service asks for one.'))}>
        <Input type="password" autoComplete="off" value={key} readOnly={locked('key')} onChange={(e) => setKey(e.target.value)} data-speech-field="key" />
      </Field>
      <p className="text-meta text-muted">{noticeCopy('speech-server', 'private')}</p>
      {error && <Notice tone="danger">{error}</Notice>}
      {result && (result.ok
        ? <Notice tone="success"><span data-speech-test="ok">{result.text ? t('The service answered: “{text}”', { text: result.text }) : t('The service answered with no words, as expected for the silent sample.')}</span></Notice>
        : <Notice tone="danger"><span data-speech-test="failed">{result.error}</span></Notice>)}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" type="submit" data-speech-save>{t('Save')}</Button>
        <Button variant="secondary" onClick={() => test()} data-speech-run-test>{t('Test')}</Button>
      </div>
    </form>
  )
}

export function SpeechServerPanel() {
  const [s, setS] = useState<SpeechSettings | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { api.speechSettings().then(setS, (err: unknown) => setError(failure(err))) }, [])
  const onSave = async (input: SpeechSettingsInput) => {
    const next = await api.updateSpeechSettings(input)
    setS(next)
    setSpeechService({ connected: next.connected, host: next.host })
  }
  const onTest = async (draft: SpeechSettingsInput): Promise<SpeechTestResult> => {
    const r = await api.testSpeechSettings(draft)
    return r.ok ? { ok: true, text: r.text ?? '' } : { ok: false, error: r.error ?? t('The speech service did not answer.') }
  }
  return (
    <SettingsSection {...cardCopy('speech-server')} id="speech-to-text">
      {s && <SpeechServerView settings={s} onSave={onSave} onTest={onTest} />}
      {error && <div className="mt-3"><Notice tone="danger">{error}</Notice></div>}
    </SettingsSection>
  )
}
