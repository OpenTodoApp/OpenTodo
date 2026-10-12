import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { clearThreads, getAutoApply, setAutoApply } from '../../lib/assistant'
import { refreshAssistantStatus, setAssistantStatus, type AssistantStatus } from '../../lib/assistantStatus'
import {
  isOwnerSettings, MEMBER_MODEL_RE, MEMBER_PROVIDERS, PROVIDERS, type AssistantMemberSettings, type AssistantOwnerSettings, type AssistantSettingsInput,
  type AssistantTestResult, type AssistantUsage, type MyAssistantInput, type ProviderName,
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
  cap_member_keys: boolean
}

export function draftFrom(s: AssistantOwnerSettings): OwnerDraft {
  const providers = {} as OwnerDraft['providers']
  for (const p of PROVIDERS) providers[p] = { enabled: s.providers[p]?.enabled ?? false, model: s.providers[p]?.model ?? '', base_url: s.providers[p]?.base_url ?? '' }
  return { enabled: s.enabled, default_provider: s.default_provider, providers, keys: {}, allow_member_keys: s.allow_member_keys,
    allow_private_endpoint: s.allow_private_endpoint, monthly_token_cap_per_user: s.monthly_token_cap_per_user, cap_member_keys: !!s.cap_member_keys }
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
    allow_private_endpoint: d.allow_private_endpoint, monthly_token_cap_per_user: d.monthly_token_cap_per_user, cap_member_keys: d.cap_member_keys }
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
        <span>Let members bring their own key <span className="block text-muted">Each person may then choose Anthropic, OpenAI or Google Gemini with their own key and model for their turns, instead of yours. The compatible endpoint is never offered to members, so no one but you decides which other host the server connects to.</span></span>
      </label>
      {d.allow_member_keys && (
        <label className="ml-6 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={d.cap_member_keys} disabled={off} onChange={(e) => set({ cap_member_keys: e.target.checked })} />
          <span>Count members’ own keys toward the monthly limit <span className="block text-muted">Off by default: a person who pays with their own key is not held to your limit. One answer at a time per person still applies.</span></span>
        </label>
      )}
      {p.saved.allow_member_keys && typeof p.saved.own_key_members === 'number' && (
        <p className="text-sm text-muted" data-own-key-members>{p.saved.own_key_members === 1 ? '1 person uses' : `${p.saved.own_key_members} people use`} their own provider and key.</p>
      )}
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

export type MemberProvider = 'anthropic' | 'openai' | 'gemini'

/** The "Which assistant you use" form (assistant-member-provider). */
export interface OwnDraft {
  mode: 'server' | 'own'
  provider: MemberProvider
  model: string
  key: string
}

const MEMBER_MODEL_HINT: Record<MemberProvider, string> = { anthropic: '', openai: 'for example gpt-4.1-mini', gemini: 'for example gemini-2.5-flash' }

function isMemberProvider(p: string | undefined): p is MemberProvider {
  return !!p && (MEMBER_PROVIDERS as string[]).includes(p)
}

export function ownDraftFrom(s: AssistantStatus): OwnDraft {
  const own = s.own_provider
  const models = s.anthropic_models ?? []
  if (own && isMemberProvider(own.provider)) return { mode: 'own', provider: own.provider, model: own.model, key: '' }
  return { mode: 'server', provider: 'anthropic', model: models[0] ?? '', key: '' }
}

/** What to send for the form, or a message saying what is missing. */
export function ownInputFrom(d: OwnDraft, s: AssistantStatus): MyAssistantInput | string {
  if (d.mode === 'server') return { own_provider: '' }
  const model = d.model.trim()
  if (d.provider === 'anthropic') {
    if (!(s.anthropic_models ?? []).includes(model)) return 'Choose one of the offered Anthropic models.'
  } else if (!MEMBER_MODEL_RE.test(model)) {
    return 'Enter a model id of up to 100 characters: letters, digits, dots, underscores, colons and hyphens.'
  }
  const key = d.key.trim()
  const saved = s.own_provider?.provider === d.provider && s.own_provider.key_set
  if (!key && !saved) return `Enter your API key for ${SHORT[d.provider]}.`
  return { own_provider: d.provider, own_model: model, ...(key ? { own_key: key } : {}) }
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
  /** Saves "Which assistant you use"; resolves true when saved. */
  onSaveOwn?: (input: MyAssistantInput) => Promise<boolean> | void
  onTestOwn?: () => void
  ownTest?: AssistantTestResult | 'running'
  ownMessage?: string | null
}

function usageText(u: AssistantUsage): string {
  const counted = u.counted_tokens ?? u.total_tokens
  const pct = u.cap ? Math.min(100, Math.round((counted / u.cap) * 100)) : null
  let text = `This month: ${u.total_tokens.toLocaleString('en')} tokens in ${u.turns} answer${u.turns === 1 ? '' : 's'}`
  text += pct !== null ? ` · ${pct}% of your ${u.cap.toLocaleString('en')}-token limit, resets ${u.resets_at}` : ' · no limit'
  const own = u.own_key?.total_tokens ?? 0
  if (own > 0) text += ` · ${own.toLocaleString('en')} on your own key${u.cap_member_keys || !u.cap ? '' : ', not counted toward the limit'}`
  return `${text}.`
}

/** "Which assistant you use": the server's, or your own provider, model and key. */
export function OwnProviderForm(p: UserViewProps & { status: AssistantStatus }) {
  const s = p.status
  const [d, setD] = useState<OwnDraft>(() => ownDraftFrom(s))
  const [problem, setProblem] = useState<string | null>(null)
  const set = (patch: Partial<OwnDraft>) => { setProblem(null); setD({ ...d, ...patch }) }
  const off = !p.connected
  const own = s.own_provider
  const ownActive = s.source === 'own'
  const models = s.anthropic_models ?? []
  const choices = (s.member_providers ?? MEMBER_PROVIDERS).filter(isMemberProvider)
  const savedSame = own?.provider === d.provider && own.key_set
  const dirty = d.mode === 'server' ? !!own : !own || own.provider !== d.provider || own.model !== d.model.trim() || !!d.key.trim()
  const capNote = s.cap_member_keys ? 'Your answers still count toward the server’s monthly limit.' : 'Answers on your key do not count toward the server’s monthly limit.'
  const save = async () => {
    const input = ownInputFrom(d, s)
    if (typeof input === 'string') { setProblem(input); return }
    const ok = await p.onSaveOwn?.(input)
    if (ok) setD((cur) => ({ ...cur, key: '' }))
  }
  const testing = p.ownTest === 'running'
  const test = p.ownTest && p.ownTest !== 'running' ? p.ownTest : null
  return (
    <fieldset className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-800" data-assistant-own>
      <legend className="px-1 font-medium">Which assistant you use</legend>
      <label className="flex items-start gap-2">
        <input type="radio" name="assistant-own-mode" className="mt-0.5" checked={d.mode === 'server'} disabled={off} onChange={() => set({ mode: 'server' })} />
        <span>The server’s assistant
          <span className="block text-muted">{s.server_provider_label ?? s.provider_label}{s.server_model ? ` (${s.server_model})` : ''}, set up by the server owner.</span>
        </span>
      </label>
      <label className="flex items-start gap-2">
        <input type="radio" name="assistant-own-mode" className="mt-0.5" checked={d.mode === 'own'} disabled={off} onChange={() => set({ mode: 'own' })} />
        <span>My own provider and key
          <span className="block text-muted">Anthropic, OpenAI or Google Gemini, with an API key from your own account. {capNote}</span>
        </span>
      </label>
      {d.mode === 'own' && (
        <div className="space-y-2 pl-6">
          <label className="block">
            <span className="block">Provider</span>
            <select className="input mt-1 min-w-0 max-w-full sm:max-w-sm" value={d.provider} disabled={off}
              onChange={(e) => {
                const provider = e.target.value as MemberProvider
                const model = provider === own?.provider ? own.model : provider === 'anthropic' ? (models[0] ?? '') : ''
                set({ provider, model, key: '' })
              }}>
              {choices.map((n) => <option key={n} value={n}>{SHORT[n]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block">Model</span>
            {d.provider === 'anthropic' ? (
              <select className="input mt-1 min-w-0 max-w-full sm:max-w-sm" value={d.model} disabled={off} onChange={(e) => set({ model: e.target.value })}>
                {!models.includes(d.model) && <option value={d.model}>Choose a model</option>}
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input className="input mt-1 max-w-sm" value={d.model} disabled={off} maxLength={100} spellCheck={false} autoCapitalize="off" autoComplete="off"
                placeholder={MEMBER_MODEL_HINT[d.provider]} onChange={(e) => set({ model: e.target.value })} />
            )}
          </label>
          <label className="block">
            <span className="block">Your API key for {SHORT[d.provider]}</span>
            <input className="input mt-1 max-w-sm" type="password" autoComplete="off" value={d.key} disabled={off} onChange={(e) => set({ key: e.target.value })}
              placeholder={savedSame ? 'Your key is saved; type to replace it' : 'Paste your key'} />
            <span className="mt-1 block text-xs text-muted">
              Requests go from this server to {SHORT[d.provider]} with your key. It is stored on the server, never shown again, never sent to your browser and never in backups or exports.
              A custom endpoint is not offered here, so no account can make the server connect to a host of its choosing.
            </span>
          </label>
        </div>
      )}
      {problem && <p role="alert" className="text-red-700 dark:text-red-300">{problem}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost border border-slate-300 dark:border-slate-700" disabled={off || p.busy || !dirty} aria-busy={p.busy} onClick={() => void save()}>
          {d.mode === 'server' ? 'Use the server’s assistant' : 'Save my provider'}
        </button>
        {ownActive && d.mode === 'own' && p.onTestOwn && (
          <button type="button" className="btn-ghost border border-slate-300 dark:border-slate-700" disabled={off || testing} onClick={p.onTestOwn}>Test connection</button>
        )}
        {testing && <span role="status" className="text-muted">Testing…</span>}
        {test && <span role="status" className={test.ok ? 'text-emerald-800 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}>{test.ok ? test.message : `${test.message}${test.code ? ` (${test.code})` : ''}`}</span>}
        {p.ownMessage && <span role="status" className="text-emerald-800 dark:text-emerald-300">{p.ownMessage}</span>}
      </div>
      {d.mode === 'server' && !ownActive && (s.server_own_key_set ?? s.own_key_set) && (
        <div className="space-y-1" data-legacy-key>
          <p className="text-muted">Your key is saved for {s.server_provider_label ?? s.provider_label}; the server’s assistant uses it instead of the server owner’s key.</p>
          <button type="button" className="btn-ghost border border-slate-300 dark:border-slate-700" disabled={off} onClick={() => p.onOwnKey('')}>Remove my key</button>
        </div>
      )}
    </fieldset>
  )
}

/** The own-key form of servers from before assistant-member-provider. */
function LegacyOwnKey(p: UserViewProps & { status: AssistantStatus }) {
  const [key, setKey] = useState('')
  const s = p.status
  return (
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
  )
}

/** Settings → Assistant for everyone: consent, which assistant you use, usage, auto-apply, conversations. */
export function UserAssistantSettings(p: UserViewProps) {
  const s = p.status
  if (!s) return null
  if (s.reason === 'encryption_enabled') return <p className="text-sm text-muted">The assistant can’t read end-to-end encrypted tasks, so it is not available for your account.</p>
  if (!s.enabled) return <p className="text-sm text-muted">The server owner has not turned the assistant on.</p>
  const ownSupported = s.source !== undefined
  const keptChoice = !s.allow_member_keys && s.own_provider
  return (
    <div className="space-y-3 text-sm" data-assistant-user>
      <p>
        Provider: <strong>{s.provider_label}</strong>{s.model ? ` (${s.model})` : ''}{s.source === 'own' ? ', with your own key' : ''}.{' '}
        {s.consented ? 'You accepted what is sent.' : 'You have not accepted yet; the assistant asks before your first message.'} Open it with <span className="kbd">Shift+I</span>.
      </p>
      {s.consented && <button type="button" className="btn-ghost border border-slate-300 dark:border-slate-700" disabled={!p.connected} onClick={p.onWithdraw}>Withdraw consent</button>}
      {p.usage && <p className="text-muted">{usageText(p.usage)}</p>}
      {s.allow_member_keys && (ownSupported ? <OwnProviderForm key={`${s.own_provider?.provider ?? ''}:${s.own_provider?.model ?? ''}`} {...p} status={s} /> : <LegacyOwnKey {...p} status={s} />)}
      {keptChoice && (
        <div className="space-y-1 rounded-md border border-slate-200 p-3 dark:border-slate-800" data-own-provider-kept>
          <p>Your own provider ({keptChoice.provider_label}) is kept but not used: the server owner does not allow members’ own keys right now, so the server’s assistant answers.</p>
          <button type="button" className="btn-ghost border border-slate-300 dark:border-slate-700" disabled={!p.connected} onClick={() => void p.onSaveOwn?.({ own_provider: '' })}>Forget my provider and key</button>
        </div>
      )}
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-0.5" checked={p.autoApply} onChange={(e) => p.onAutoApply(e.target.checked)} />
        <span>Apply small changes without review (this device) <span className="block text-muted">Up to 3 existing tasks: completing, dates, priority or labels. Creating, moving, deleting or editing text always asks you. An Undo button always appears.</span></span>
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
  const [ownBusy, setOwnBusy] = useState(false)
  const [ownMessage, setOwnMessage] = useState<string | null>(null)
  const [ownTest, setOwnTest] = useState<AssistantTestResult | 'running' | undefined>(undefined)

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
  const updateMine = async (input: MyAssistantInput): Promise<boolean> => {
    setUserError(null)
    setOwnMessage(null)
    try {
      const next = await api.setMyAssistant({ ...input, provider: status?.provider })
      setAssistantStatus(next)
      setStatus(next)
      return true
    } catch (err) {
      setUserError(message(err))
      return false
    }
  }
  const saveOwn = async (input: MyAssistantInput): Promise<boolean> => {
    setOwnBusy(true)
    setOwnTest(undefined)
    const ok = await updateMine(input)
    setOwnBusy(false)
    if (ok) setOwnMessage(input.own_provider ? 'Saved. Before your next message, the assistant asks you to accept what is sent to your provider.' : 'Saved.')
    return ok
  }
  const testOwn = async () => {
    setOwnTest('running')
    try {
      setOwnTest(await api.testMyAssistant())
    } catch (err) {
      setOwnTest({ ok: false, message: message(err) })
    }
  }

  return (
    <section className="space-y-3" aria-labelledby="assistant-settings-heading">
      <HelpHeading screen="settings/assistant" id="assistant-settings-heading" className="font-semibold">Assistant</HelpHeading>
      <p className="text-sm text-muted">
        Plan and change your tasks by talking, with a model provider your server owner chooses (including a model on your own network), or with your own provider and key when the owner allows it.
        Every change is proposed for you to review and can be undone. Conversations stay on this device.
      </p>
      {!connected && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200" role="status">You are offline. These settings live on the server and need a connection.</p>}
      {isOwner && settings && isOwnerSettings(settings) && draft && (
        <OwnerAssistantSettings saved={settings} draft={draft} connected={connected} busy={busy} error={error} message={msg} tests={tests}
          onChange={setDraft} onSave={() => void save()} onTest={(p) => void test(p)} />
      )}
      {!isOwner && error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      <UserAssistantSettings status={status} usage={usage} autoApply={autoApply} connected={connected} busy={ownBusy} error={userError} cleared={cleared}
        onWithdraw={() => void updateMine({ consent: false })} onOwnKey={(k) => void updateMine({ own_key: k })}
        onSaveOwn={saveOwn} onTestOwn={() => void testOwn()} ownTest={ownTest} ownMessage={ownMessage}
        onAutoApply={(on) => { setAuto(on); void setAutoApply(on) }} onClear={() => { void clearThreads().then(() => setCleared(true)) }} />
    </section>
  )
}
