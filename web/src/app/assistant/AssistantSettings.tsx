import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { clearThreads, getAutoApply, setAutoApply } from '../../lib/assistant'
import { refreshAssistantStatus, setAssistantStatus, type AssistantStatus } from '../../lib/assistantStatus'
import {
  isOwnerSettings, PROVIDERS, type AssistantMemberSettings, type AssistantOwnerSettings, type AssistantSettingsInput, type AssistantTestResult,
  type AssistantUsage, type ProviderName,
} from '../../lib/assistantTypes'
import { useOnline } from '../../lib/online'
import { HelpHeading } from '../help/HelpLink'

const LABEL: Record<ProviderName, string> = { anthropic: 'Anthropic (Claude)', openai: 'OpenAI', gemini: 'Google Gemini', compatible: 'Compatible endpoint (Ollama, LM Studio, OpenRouter, …)' }
const SHORT: Record<ProviderName, string> = { anthropic: 'Anthropic (Claude)', openai: 'OpenAI', gemini: 'Google Gemini', compatible: 'Compatible endpoint' }
/** Pre-filled suggestions the owner can change; only the Anthropic default is built into the server. */
const MODEL_HINT: Record<ProviderName, string> = { anthropic: 'claude-opus-5-5', openai: 'a model id from your OpenAI account', gemini: 'a Gemini model id', compatible: 'the model name your server serves' }

export interface OwnerDraft {
  enabled: boolean
  default_provider: ProviderName
  providers: Record<ProviderName, { enabled: boolean; model: string; base_url: string }>
  keys: Partial<Record<ProviderName, string>>
  allow_member_keys: boolean
  allow_private_endpoint: boolean
  monthly_token_cap_per_user: number
}

export function draftFrom(s: AssistantOwnerSettings): OwnerDraft {
  const providers = {} as OwnerDraft['providers']
  for (const p of PROVIDERS) providers[p] = { enabled: s.providers[p]?.enabled ?? false, model: s.providers[p]?.model ?? '', base_url: s.providers[p]?.base_url ?? '' }
  return { enabled: s.enabled, default_provider: s.default_provider, providers, keys: {}, allow_member_keys: s.allow_member_keys,
    allow_private_endpoint: s.allow_private_endpoint, monthly_token_cap_per_user: s.monthly_token_cap_per_user }
}

export function inputFrom(d: OwnerDraft): AssistantSettingsInput {
  const providers: AssistantSettingsInput['providers'] = {}
  for (const p of PROVIDERS) {
    const v = d.providers[p]
    providers[p] = p === 'compatible' ? { enabled: v.enabled, model: v.model.trim(), base_url: v.base_url.trim() } : { enabled: v.enabled, model: v.model.trim() }
  }
  const keys: AssistantSettingsInput['keys'] = {}
  for (const [k, v] of Object.entries(d.keys)) if (v !== undefined) keys[k as ProviderName] = v
  return { enabled: d.enabled, default_provider: d.default_provider, providers, keys, allow_member_keys: d.allow_member_keys,
    allow_private_endpoint: d.allow_private_endpoint, monthly_token_cap_per_user: d.monthly_token_cap_per_user }
}

export interface OwnerViewProps {
  saved: AssistantOwnerSettings
  draft: OwnerDraft
  connected: boolean
  busy: boolean
  error: string | null
  message: string | null
  tests: Partial<Record<ProviderName, AssistantTestResult | 'running'>>
  onChange: (d: OwnerDraft) => void
  onSave: () => void
  onTest: (p: ProviderName) => void
}

/** Settings → Assistant for the owner: providers, keys, models, base URL, network, caps. */
export function OwnerAssistantSettings(p: OwnerViewProps) {
  const d = p.draft
  const set = (patch: Partial<OwnerDraft>) => p.onChange({ ...d, ...patch })
  const setProv = (name: ProviderName, patch: Partial<OwnerDraft['providers'][ProviderName]>) =>
    set({ providers: { ...d.providers, [name]: { ...d.providers[name], ...patch } } })
  const off = !p.connected
  return (
    <div className="space-y-3" data-assistant-owner>
      <label className="flex items-start gap-2 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
        <input type="checkbox" className="mt-0.5" checked={d.enabled} disabled={off} onChange={(e) => set({ enabled: e.target.checked })} />
        <span>
          <span className="font-medium">Turn on the assistant for this server</span>
          <span className="block text-muted">Off by default. While off, no one sees it and the server contacts no model provider. Each person still has to accept what is sent before their first message.</span>
        </span>
      </label>
      <label className="block text-sm">
        <span className="font-medium">Provider everyone uses</span>
        <select className="input mt-1 min-w-0 max-w-full sm:max-w-sm" value={d.default_provider} disabled={off} onChange={(e) => set({ default_provider: e.target.value as ProviderName })}>
          {PROVIDERS.map((n) => <option key={n} value={n}>{SHORT[n]}</option>)}
        </select>
        <span className="mt-1 block text-xs text-muted">Changing it asks every person to accept the disclosure again.</span>
      </label>
      {PROVIDERS.map((n) => {
        const v = d.providers[n]
        const keySet = p.saved.providers[n]?.key_set
        const test = p.tests[n]
        return (
          <fieldset key={n} className="space-y-2 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800" data-provider={n}>
            <legend className="px-1 font-medium">{LABEL[n]}</legend>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={v.enabled} disabled={off} onChange={(e) => setProv(n, { enabled: e.target.checked })} />
              Allow this provider
            </label>
            <label className="block">
              <span>Model</span>
              <input className="input mt-1" value={v.model} disabled={off} placeholder={MODEL_HINT[n]} list={n === 'anthropic' ? 'assistant-anthropic-models' : undefined}
                onChange={(e) => setProv(n, { model: e.target.value })} spellCheck={false} />
              {n === 'anthropic' && (
                <datalist id="assistant-anthropic-models">
                  {p.saved.anthropic_models.map((m) => <option key={m} value={m} />)}
                </datalist>
              )}
            </label>
            {n === 'compatible' && (
              <label className="block">
                <span>Base URL</span>
                <input className="input mt-1" value={v.base_url} disabled={off} placeholder="http://192.168.1.20:11434/v1" inputMode="url" spellCheck={false}
                  onChange={(e) => setProv(n, { base_url: e.target.value })} />
              </label>
            )}
            <label className="block">
              <span>API key {n === 'compatible' ? '(if the endpoint needs one)' : ''}</span>
              <input className="input mt-1" type="password" autoComplete="off" disabled={off} value={d.keys[n] ?? ''}
                placeholder={keySet ? 'A key is saved; type to replace it' : 'Paste the key'} onChange={(e) => set({ keys: { ...d.keys, [n]: e.target.value } })} />
              <span className="mt-1 block text-xs text-muted">Stored in the server’s secrets file, never shown again, never in backups or exports.</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {keySet && <button type="button" className="btn-ghost border border-slate-300 dark:border-slate-700" disabled={off} onClick={() => set({ keys: { ...d.keys, [n]: '' } })}>Remove saved key</button>}
              <button type="button" className="btn-ghost border border-slate-300 dark:border-slate-700" disabled={off || test === 'running'} onClick={() => p.onTest(n)}>Test connection</button>
              {test && test !== 'running' && <span role="status" className={test.ok ? 'text-emerald-800 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}>{test.ok ? test.message : `${test.message}${test.code ? ` (${test.code})` : ''}`}</span>}
              {test === 'running' && <span role="status" className="text-muted">Testing…</span>}
            </div>
          </fieldset>
        )
      })}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5" checked={d.allow_private_endpoint} disabled={off} onChange={(e) => set({ allow_private_endpoint: e.target.checked })} />
        <span>Allow private endpoints <span className="block text-muted">Needed for a model server on your own network (Ollama, LM Studio). Off, the compatible endpoint may only be a public address.</span></span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5" checked={d.allow_member_keys} disabled={off} onChange={(e) => set({ allow_member_keys: e.target.checked })} />
        <span>Let members bring their own key <span className="block text-muted">Their key is used for their turns instead of yours.</span></span>
      </label>
      <label className="block text-sm">
        <span className="font-medium">Monthly tokens per person</span>
        <input className="input mt-1 max-w-[12rem]" type="number" min={0} step={10000} value={d.monthly_token_cap_per_user} disabled={off}
          onChange={(e) => set({ monthly_token_cap_per_user: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
        <span className="mt-1 block text-xs text-muted">0 means unlimited. Usage resets on the first day of each month (UTC).</span>
      </label>
      {p.error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{p.error}</p>}
      {p.message && <p role="status" className="text-sm text-emerald-800 dark:text-emerald-300">{p.message}</p>}
      <button type="button" className="btn-primary" disabled={off} aria-busy={p.busy} onClick={() => { if (!p.busy) p.onSave() }}>Save assistant settings</button>
    </div>
  )
}

export interface UserViewProps {
  status: AssistantStatus | null
  usage: AssistantUsage | null
  autoApply: boolean
  connected: boolean
  busy: boolean
  error: string | null
  onWithdraw: () => void
  onOwnKey: (key: string) => void
  onAutoApply: (on: boolean) => void
  onClear: () => void
  cleared: boolean
}

/** Settings → Assistant for everyone: consent, own key, usage, auto-apply, conversations. */
export function UserAssistantSettings(p: UserViewProps) {
  const [key, setKey] = useState('')
  const s = p.status
  if (!s) return null
  if (s.reason === 'encryption_enabled') return <p className="text-sm text-muted">The assistant can’t read end-to-end encrypted tasks, so it is not available for your account.</p>
  if (!s.enabled) return <p className="text-sm text-muted">The server owner has not turned the assistant on.</p>
  const pct = p.usage && p.usage.cap ? Math.min(100, Math.round((p.usage.total_tokens / p.usage.cap) * 100)) : null
  return (
    <div className="space-y-3 text-sm" data-assistant-user>
      <p>
        Provider: <strong>{s.provider_label}</strong>{s.model ? ` (${s.model})` : ''}.{' '}
        {s.consented ? 'You accepted what is sent.' : 'You have not accepted yet; the assistant asks before your first message.'} Open it with <span className="kbd">Shift+I</span>.
      </p>
      {s.consented && <button type="button" className="btn-ghost border border-slate-300 dark:border-slate-700" disabled={!p.connected} onClick={p.onWithdraw}>Withdraw consent</button>}
      {p.usage && (
        <p className="text-muted">
          This month: {p.usage.total_tokens.toLocaleString('en')} tokens in {p.usage.turns} answer{p.usage.turns === 1 ? '' : 's'}
          {pct !== null ? ` · ${pct}% of your ${p.usage.cap.toLocaleString('en')}-token limit, resets ${p.usage.resets_at}` : ' · no limit'}.
        </p>
      )}
      {s.allow_member_keys && (
        <div className="space-y-1">
          <label className="block">
            <span className="font-medium">Your own API key</span>
            <input className="input mt-1 max-w-sm" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} disabled={!p.connected}
              placeholder={s.own_key_set ? 'Your key is saved; type to replace it' : 'Optional'} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost border border-slate-300 dark:border-slate-700" disabled={!p.connected || !key.trim()} onClick={() => { p.onOwnKey(key.trim()); setKey('') }}>Save my key</button>
            {s.own_key_set && <button type="button" className="btn-ghost border border-slate-300 dark:border-slate-700" disabled={!p.connected} onClick={() => p.onOwnKey('')}>Remove my key</button>}
          </div>
        </div>
      )}
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-0.5" checked={p.autoApply} onChange={(e) => p.onAutoApply(e.target.checked)} />
        <span>Apply small changes without review (this device) <span className="block text-muted">Up to 3 existing tasks: completing, dates, priority, labels, project or section. Creating, deleting or editing text always asks you. An Undo button always appears.</span></span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost border border-slate-300 dark:border-slate-700" onClick={p.onClear}>Clear conversations on this device</button>
        {p.cleared && <span role="status" className="text-muted">Cleared.</span>}
      </div>
      {p.error && <p role="alert" className="text-red-700 dark:text-red-300">{p.error}</p>}
    </div>
  )
}

function message(err: unknown): string {
  if (err instanceof ApiError) return err.message.charAt(0).toUpperCase() + err.message.slice(1)
  return 'The server is unreachable. These settings live on the server and need a connection.'
}

/** Settings → Assistant (lazy chunk). */
export default function AssistantSettingsSection({ isOwner }: { isOwner: boolean }) {
  const connected = useOnline()
  const [settings, setSettings] = useState<AssistantOwnerSettings | AssistantMemberSettings | null>(null)
  const [draft, setDraft] = useState<OwnerDraft | null>(null)
  const [status, setStatus] = useState<AssistantStatus | null>(null)
  const [usage, setUsage] = useState<AssistantUsage | null>(null)
  const [autoApply, setAuto] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userError, setUserError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [tests, setTests] = useState<OwnerViewProps['tests']>({})
  const [cleared, setCleared] = useState(false)

  const load = useCallback(async () => {
    try {
      const s = await api.getAssistantSettings()
      setSettings(s)
      if (isOwnerSettings(s)) setDraft(draftFrom(s))
      setStatus(await refreshAssistantStatus())
      setUsage(await api.assistantUsage().catch(() => null))
    } catch (err) {
      setError(message(err))
      setStatus(await refreshAssistantStatus())
    }
  }, [])
  useEffect(() => {
    void load()
    void getAutoApply().then(setAuto)
  }, [load])

  const save = async () => {
    if (!draft) return
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      const s = await api.saveAssistantSettings(inputFrom(draft))
      setSettings(s)
      setDraft(draftFrom(s))
      setStatus(await refreshAssistantStatus())
      setMsg('Saved.')
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }
  const test = async (p: ProviderName) => {
    setTests((t) => ({ ...t, [p]: 'running' }))
    try {
      const r = await api.testAssistant(p)
      setTests((t) => ({ ...t, [p]: r }))
    } catch (err) {
      setTests((t) => ({ ...t, [p]: { ok: false, message: message(err) } }))
    }
  }
  const updateMine = async (input: { consent?: boolean; own_key?: string }) => {
    setUserError(null)
    try {
      const next = await api.setMyAssistant({ ...input, provider: status?.provider })
      setAssistantStatus(next)
      setStatus(next)
    } catch (err) {
      setUserError(message(err))
    }
  }

  return (
    <section className="space-y-3" aria-labelledby="assistant-settings-heading">
      <HelpHeading screen="settings/assistant" id="assistant-settings-heading" className="font-semibold">Assistant</HelpHeading>
      <p className="text-sm text-muted">
        Plan and change your tasks by talking, with a model provider your server owner chooses (including a model on your own network).
        Every change is proposed for you to review and can be undone. Conversations stay on this device.
      </p>
      {!connected && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200" role="status">You are offline. These settings live on the server and need a connection.</p>}
      {isOwner && settings && isOwnerSettings(settings) && draft && (
        <OwnerAssistantSettings saved={settings} draft={draft} connected={connected} busy={busy} error={error} message={msg} tests={tests}
          onChange={setDraft} onSave={() => void save()} onTest={(p) => void test(p)} />
      )}
      {!isOwner && error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      <UserAssistantSettings status={status} usage={usage} autoApply={autoApply} connected={connected} busy={busy} error={userError} cleared={cleared}
        onWithdraw={() => void updateMine({ consent: false })} onOwnKey={(k) => void updateMine({ own_key: k })}
        onAutoApply={(on) => { setAuto(on); void setAutoApply(on) }} onClear={() => { void clearThreads().then(() => setCleared(true)) }} />
    </section>
  )
}
