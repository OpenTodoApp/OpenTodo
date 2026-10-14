import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { clearThreads, getAutoApply, setAutoApply } from '../../lib/assistant'
import { refreshAssistantStatus, setAssistantStatus, type AssistantStatus } from '../../lib/assistantStatus'
import {
  isOwnerSettings, MEMBER_MODEL_RE, MEMBER_PROVIDERS, PROVIDERS, type AssistantMemberSettings, type AssistantOwnerSettings, type AssistantSettingsInput,
  type AssistantTestResult, type AssistantUsage, type MyAssistantInput, type ProviderName,
} from '../../lib/assistantTypes'
import { useOnline } from '../../lib/online'
import { Button } from '../../ui/Button'
import { Badge } from '../../ui/Card'
import { Field, Input, Select } from '../../ui/Field'
import { ConfirmDialog } from '../../ui/patterns/ConfirmDialog'
import { Notice } from '../../ui/patterns/Notice'
import { SettingRow, SettingsSection } from '../../ui/patterns/SettingsSection'
import { Checkbox, Switch } from '../../ui/Switch'
import { Dialog } from '../overlay/Dialog'
import { formatDate } from '../../lib/dates'
import { useDateTimeFormat } from '../DateTimePrefsProvider'

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

function TestResult({ test }: { test: AssistantTestResult | 'running' | undefined | null }) {
  if (!test) return null
  if (test === 'running') return <Notice>Testing…</Notice>
  return <Notice tone={test.ok ? 'success' : 'danger'}>{test.ok ? test.message : `${test.message}${test.code ? ` (${test.code})` : ''}`}</Notice>
}

/** The owner's configuration, shown in the Configure dialog: providers, keys, models, base URL, network, caps. */
export function OwnerAssistantSettings(p: OwnerViewProps & { onCancel?: () => void }) {
  const d = p.draft
  const set = (patch: Partial<OwnerDraft>) => p.onChange({ ...d, ...patch })
  const setProv = (name: ProviderName, patch: Partial<OwnerDraft['providers'][ProviderName]>) =>
    set({ providers: { ...d.providers, [name]: { ...d.providers[name], ...patch } } })
  const off = !p.connected
  return (
    <div className="space-y-4" data-assistant-owner-form>
      <Checkbox checked={d.enabled} disabled={off} onChange={(e) => set({ enabled: e.target.checked })} label="Turn on the assistant for this server"
        description="Off by default. While off, no one sees it and the server contacts no model provider. Each person still has to accept what is sent before their first message." />
      <Field label="Provider everyone uses" description="Changing it asks every person to accept the disclosure again.">
        <Select className="min-w-0 max-w-full sm:max-w-sm" value={d.default_provider} disabled={off} onChange={(e) => set({ default_provider: e.target.value as ProviderName })}>
          {PROVIDERS.map((n) => <option key={n} value={n}>{SHORT[n]}</option>)}
        </Select>
      </Field>
      {PROVIDERS.map((n) => {
        const v = d.providers[n]
        const keySet = p.saved.providers[n]?.key_set
        const test = p.tests[n]
        return (
          <fieldset key={n} className="space-y-3 rounded-control border border-default p-3" data-provider={n}>
            <legend className="px-1 text-sm font-medium text-default">{LABEL[n]}</legend>
            <Checkbox checked={v.enabled} disabled={off} onChange={(e) => setProv(n, { enabled: e.target.checked })} label="Allow this provider" />
            <Field label="Model">
              <Input value={v.model} disabled={off} placeholder={MODEL_HINT[n]} list={n === 'anthropic' ? 'assistant-anthropic-models' : undefined}
                onChange={(e) => setProv(n, { model: e.target.value })} spellCheck={false} />
            </Field>
            {n === 'anthropic' && (
              <datalist id="assistant-anthropic-models">
                {p.saved.anthropic_models.map((m) => <option key={m} value={m} />)}
              </datalist>
            )}
            {n === 'compatible' && (
              <Field label="Base URL">
                <Input value={v.base_url} disabled={off} placeholder="http://192.168.1.20:11434/v1" inputMode="url" spellCheck={false}
                  onChange={(e) => setProv(n, { base_url: e.target.value })} />
              </Field>
            )}
            <Field label={`API key${n === 'compatible' ? ' (if the endpoint needs one)' : ''}`}
              description="Stored in the server’s secrets file, never shown again, never in backups or exports.">
              <Input type="password" autoComplete="off" disabled={off} value={d.keys[n] ?? ''}
                placeholder={keySet ? 'A key is saved; type to replace it' : 'Paste the key'} onChange={(e) => set({ keys: { ...d.keys, [n]: e.target.value } })} />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={off} busy={test === 'running'} onClick={() => p.onTest(n)}>Test connection</Button>
              {keySet && <Button size="sm" variant="ghost" disabled={off} onClick={() => set({ keys: { ...d.keys, [n]: '' } })}>Remove saved key</Button>}
            </div>
            <TestResult test={test} />
          </fieldset>
        )
      })}
      <Checkbox checked={d.allow_private_endpoint} disabled={off} onChange={(e) => set({ allow_private_endpoint: e.target.checked })} label="Allow private endpoints"
        description="Needed for a model server on your own network (Ollama, LM Studio). Off, the compatible endpoint may only be a public address." />
      <Checkbox checked={d.allow_member_keys} disabled={off} onChange={(e) => set({ allow_member_keys: e.target.checked })} label="Let members bring their own key"
        description="Each person may then choose Anthropic, OpenAI or Google Gemini with their own key and model for their turns, instead of yours. The compatible endpoint is never offered to members, so no one but you decides which other host the server connects to." />
      {d.allow_member_keys && (
        <div className="pl-6">
          <Checkbox checked={d.cap_member_keys} disabled={off} onChange={(e) => set({ cap_member_keys: e.target.checked })} label="Count members’ own keys toward the monthly limit"
            description="Off by default: a person who pays with their own key is not held to your limit. One answer at a time per person still applies." />
        </div>
      )}
      {p.saved.allow_member_keys && typeof p.saved.own_key_members === 'number' && (
        <p className="text-meta text-muted" data-own-key-members>{p.saved.own_key_members === 1 ? '1 person uses' : `${p.saved.own_key_members} people use`} their own provider and key.</p>
      )}
      <Field label="Monthly tokens per person" description="0 means unlimited. Usage resets on the first day of each month (UTC).">
        <Input className="max-w-[12rem]" type="number" min={0} step={10000} value={d.monthly_token_cap_per_user} disabled={off}
          onChange={(e) => set({ monthly_token_cap_per_user: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
      </Field>
      {p.error && <Notice tone="danger">{p.error}</Notice>}
      {p.message && <Notice tone="success">{p.message}</Notice>}
      <div className="flex justify-end gap-2">
        {p.onCancel && <Button variant="ghost" onClick={p.onCancel}>Cancel</Button>}
        <Button variant="primary" disabled={off} busy={p.busy} onClick={p.onSave}>Save assistant settings</Button>
      </div>
    </div>
  )
}

export interface OwnerSummaryProps {
  saved: AssistantOwnerSettings
  connected: boolean
  onConfigure: () => void
}

/** The owner's view of the server's assistant: its state at a glance, with the form behind Configure. */
export function OwnerAssistantSummary({ saved, connected, onConfigure }: OwnerSummaryProps) {
  const model = saved.providers[saved.default_provider]?.model
  const allowed = PROVIDERS.filter((n) => saved.providers[n]?.enabled)
  const cap = saved.monthly_token_cap_per_user
  return (
    <div className="divide-y divide-(--ot-border)" data-assistant-owner>
      <SettingRow label="On this server"
        status={(
          <span className="flex flex-wrap items-center gap-2" data-testid="assistant-owner-status">
            <Badge hue={saved.enabled ? 'green' : 'slate'}>{saved.enabled ? 'On' : 'Off'}</Badge>
            <span>{saved.enabled
              ? `Everyone uses ${SHORT[saved.default_provider]}${model ? ` (${model})` : ''}.`
              : 'No one sees the assistant and the server contacts no model provider.'}</span>
          </span>
        )}
        control={<Button size="sm" icon="settings" disabled={!connected} onClick={onConfigure}>Configure</Button>} />
      <SettingRow label="Providers allowed"
        status={allowed.length === 0 ? 'None yet.' : (
          <span className="flex flex-wrap gap-1.5">
            {allowed.map((n) => (
              <Badge key={n} hue={saved.providers[n]?.key_set || n === 'compatible' ? 'blue' : 'orange'}>
                {SHORT[n]}{saved.providers[n]?.key_set || n === 'compatible' ? '' : ' · no key'}
              </Badge>
            ))}
          </span>
        )} />
      <SettingRow label="Monthly tokens per person" status={cap ? `${cap.toLocaleString('en')} tokens` : 'Unlimited'} />
      <SettingRow label="Members’ own keys"
        status={saved.allow_member_keys
          ? `Allowed${saved.cap_member_keys ? ', counted toward the limit' : ''}${typeof saved.own_key_members === 'number' ? ` · ${saved.own_key_members === 1 ? '1 person uses' : `${saved.own_key_members} people use`} their own` : ''}.`
          : 'Not allowed.'} />
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
  text += pct !== null ? ` · ${pct}% of your ${u.cap.toLocaleString('en')}-token limit, resets ${formatDate(u.resets_at, 'compact')}` : ' · no limit'
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
  const radio = 'mt-0.5 h-4 w-4 shrink-0 accent-(--ot-accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
  return (
    <fieldset className="space-y-3 py-3 text-sm" data-assistant-own>
      <legend className="float-left mb-2 w-full text-sm font-medium text-default">Which assistant you use</legend>
      <label className="clear-left flex items-start gap-2.5">
        <input type="radio" name="assistant-own-mode" className={radio} checked={d.mode === 'server'} disabled={off} onChange={() => set({ mode: 'server' })} />
        <span className="text-default">The server’s assistant
          <span className="block text-meta text-muted">{s.server_provider_label ?? s.provider_label}{s.server_model ? ` (${s.server_model})` : ''}, set up by the server owner.</span>
        </span>
      </label>
      <label className="flex items-start gap-2.5">
        <input type="radio" name="assistant-own-mode" className={radio} checked={d.mode === 'own'} disabled={off} onChange={() => set({ mode: 'own' })} />
        <span className="text-default">My own provider and key
          <span className="block text-meta text-muted">Anthropic, OpenAI or Google Gemini, with an API key from your own account. {capNote}</span>
        </span>
      </label>
      {d.mode === 'own' && (
        <div className="space-y-3 pl-6">
          <Field label="Provider">
            <Select className="min-w-0 max-w-full sm:max-w-sm" value={d.provider} disabled={off}
              onChange={(e) => {
                const provider = e.target.value as MemberProvider
                const model = provider === own?.provider ? own.model : provider === 'anthropic' ? (models[0] ?? '') : ''
                set({ provider, model, key: '' })
              }}>
              {choices.map((n) => <option key={n} value={n}>{SHORT[n]}</option>)}
            </Select>
          </Field>
          <Field label="Model">
            {d.provider === 'anthropic' ? (
              <Select className="min-w-0 max-w-full sm:max-w-sm" value={d.model} disabled={off} onChange={(e) => set({ model: e.target.value })}>
                {!models.includes(d.model) && <option value={d.model}>Choose a model</option>}
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            ) : (
              <Input className="max-w-sm" value={d.model} disabled={off} maxLength={100} spellCheck={false} autoCapitalize="off" autoComplete="off"
                placeholder={MEMBER_MODEL_HINT[d.provider]} onChange={(e) => set({ model: e.target.value })} />
            )}
          </Field>
          <Field label={`Your API key for ${SHORT[d.provider]}`}
            description={`Requests go from this server to ${SHORT[d.provider]} with your key. It is stored on the server, never shown again, never sent to your browser and never in backups or exports. A custom endpoint is not offered here, so no account can make the server connect to a host of its choosing.`}>
            <Input className="max-w-sm" type="password" autoComplete="off" value={d.key} disabled={off} onChange={(e) => set({ key: e.target.value })}
              placeholder={savedSame ? 'Your key is saved; type to replace it' : 'Paste your key'} />
          </Field>
        </div>
      )}
      {problem && <Notice tone="danger">{problem}</Notice>}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={dirty ? 'primary' : 'secondary'} disabled={off || !dirty} busy={p.busy} onClick={() => void save()}>
          {d.mode === 'server' ? 'Use the server’s assistant' : 'Save my provider'}
        </Button>
        {ownActive && d.mode === 'own' && p.onTestOwn && (
          <Button size="sm" disabled={off} busy={p.ownTest === 'running'} onClick={p.onTestOwn}>Test connection</Button>
        )}
      </div>
      <TestResult test={p.ownTest} />
      {p.ownMessage && <Notice tone="success">{p.ownMessage}</Notice>}
      {d.mode === 'server' && !ownActive && (s.server_own_key_set ?? s.own_key_set) && (
        <div data-legacy-key>
          <Notice action={<Button size="sm" variant="ghost" disabled={off} onClick={() => p.onOwnKey('')}>Remove my key</Button>}>
            Your key is saved for {s.server_provider_label ?? s.provider_label}; the server’s assistant uses it instead of the server owner’s key.
          </Notice>
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
    <div className="space-y-2 py-3">
      <Field label="Your own API key">
        <Input className="max-w-sm" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} disabled={!p.connected}
          placeholder={s.own_key_set ? 'Your key is saved; type to replace it' : 'Optional'} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!p.connected || !key.trim()} onClick={() => { p.onOwnKey(key.trim()); setKey('') }}>Save my key</Button>
        {s.own_key_set && <Button size="sm" variant="ghost" disabled={!p.connected} onClick={() => p.onOwnKey('')}>Remove my key</Button>}
      </div>
    </div>
  )
}

/** Settings → AI → Assistant for everyone: consent, which assistant you use, usage, auto-apply, conversations. */
export function UserAssistantSettings(p: UserViewProps) {
  useDateTimeFormat()
  const s = p.status
  if (!s) return null
  if (s.reason === 'encryption_enabled') return <div className="py-3"><Notice>The assistant can’t read end-to-end encrypted tasks, so it is not available for your account.</Notice></div>
  if (!s.enabled) return <div className="py-3"><Notice>The server owner has not turned the assistant on.</Notice></div>
  const ownSupported = s.source !== undefined
  const keptChoice = !s.allow_member_keys && s.own_provider
  return (
    <div className="divide-y divide-(--ot-border)" data-assistant-user>
      <SettingRow label="Your assistant"
        status={(
          <span className="block space-y-1">
            <span className="block">Provider: <strong>{s.provider_label}</strong>{s.model ? ` (${s.model})` : ''}{s.source === 'own' ? ', with your own key' : ''}.</span>
            <span className="flex flex-wrap items-center gap-2 text-muted">
              <Badge hue={s.consented ? 'green' : 'slate'}>{s.consented ? 'Accepted' : 'Not accepted yet'}</Badge>
              {s.consented ? 'You accepted what is sent.' : 'You have not accepted yet; the assistant asks before your first message.'} Open it with <span className="kbd">Shift+I</span>.
            </span>
          </span>
        )}
        control={s.consented ? <Button size="sm" disabled={!p.connected} onClick={p.onWithdraw}>Withdraw consent</Button> : undefined} />
      {p.usage && <SettingRow label="Usage" status={<span className="text-muted">{usageText(p.usage)}</span>} />}
      {s.allow_member_keys && (ownSupported ? <OwnProviderForm key={`${s.own_provider?.provider ?? ''}:${s.own_provider?.model ?? ''}`} {...p} status={s} /> : <LegacyOwnKey {...p} status={s} />)}
      {keptChoice && (
        <div className="py-3" data-own-provider-kept>
          <Notice tone="warning" action={<Button size="sm" variant="ghost" disabled={!p.connected} onClick={() => void p.onSaveOwn?.({ own_provider: '' })}>Forget my provider and key</Button>}>
            Your own provider ({keptChoice.provider_label}) is kept but not used: the server owner does not allow members’ own keys right now, so the server’s assistant answers.
          </Notice>
        </div>
      )}
      <SettingRow label="Apply small changes without review (this device)"
        description="Up to 3 existing tasks: completing, dates, priority or labels. Creating, moving, deleting or editing text always asks you. An Undo button always appears."
        control={<Switch checked={p.autoApply} onChange={p.onAutoApply} label="Apply small changes without review (this device)" hideLabel />} />
      <SettingRow label="Conversations" description="Stored only on this device, never on the server."
        status={p.cleared ? <span role="status" className="text-muted">Cleared.</span> : undefined}
        control={<Button size="sm" variant="danger" onClick={p.onClear}>Clear conversations on this device</Button>} />
      {p.error && <div className="py-3"><Notice tone="danger">{p.error}</Notice></div>}
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
  const [configuring, setConfiguring] = useState(false)
  const [clearing, setClearing] = useState(false)

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
      setConfiguring(false)
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

  const configure = () => {
    if (settings && isOwnerSettings(settings)) setDraft(draftFrom(settings))
    setError(null)
    setMsg(null)
    setConfiguring(true)
  }

  return (
    <SettingsSection title="Assistant" helpId="settings/assistant" headingId="assistant-settings-heading" testId="assistant-settings"
      description="Plan and change your tasks by talking, with a model provider your server owner chooses (including a model on your own network), or with your own provider and key when the owner allows it. Every change is proposed for you to review and can be undone. Conversations stay on this device.">
      {!connected && <div className="pb-3"><Notice>You are offline. These settings live on the server and need a connection.</Notice></div>}
      {error && !configuring && <div className="py-3"><Notice tone="danger">{error}</Notice></div>}
      {msg && !configuring && <div className="py-3"><Notice tone="success">{msg}</Notice></div>}
      {isOwner && settings && isOwnerSettings(settings) && <OwnerAssistantSummary saved={settings} connected={connected} onConfigure={configure} />}
      <UserAssistantSettings status={status} usage={usage} autoApply={autoApply} connected={connected} busy={ownBusy} error={userError} cleared={cleared}
        onWithdraw={() => void updateMine({ consent: false })} onOwnKey={(k) => void updateMine({ own_key: k })}
        onSaveOwn={saveOwn} onTestOwn={() => void testOwn()} ownTest={ownTest} ownMessage={ownMessage}
        onAutoApply={(on) => { setAuto(on); void setAutoApply(on) }} onClear={() => setClearing(true)} />
      {configuring && isOwner && settings && isOwnerSettings(settings) && draft && (
        <Dialog title="Configure the assistant" onClose={() => setConfiguring(false)} size="lg" dismissable={false} testId="assistant-configure">
          <OwnerAssistantSettings saved={settings} draft={draft} connected={connected} busy={busy} error={error} message={null} tests={tests}
            onChange={setDraft} onSave={() => void save()} onTest={(p) => void test(p)} onCancel={() => setConfiguring(false)} />
        </Dialog>
      )}
      {clearing && (
        <ConfirmDialog title="Clear conversations on this device?" confirmLabel="Clear conversations"
          consequence="Every assistant conversation stored in this browser is deleted. Your tasks and changes already applied stay as they are."
          onConfirm={() => clearThreads().then(() => setCleared(true))} onCancel={() => setClearing(false)} />
      )}
    </SettingsSection>
  )
}
