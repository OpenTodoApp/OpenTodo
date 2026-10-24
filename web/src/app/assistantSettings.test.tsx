import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AssistantStatus } from '../lib/assistantStatus'
import type { AssistantOwnerSettings } from '../lib/assistantTypes'
import { assistantStatusLine, draftFrom, inputFrom, ownDraftFrom, SAVE_TO_USE, testDraft, testIsUnsaved, ownInputFrom, OwnerAssistantSettings, OwnerAssistantSummary, UserAssistantSettings } from './assistant/AssistantSettings'
import { formatDate } from '../lib/dates'

const noop = () => {}
const saved: AssistantOwnerSettings = {
  enabled: true, active: true, default_provider: 'anthropic', allow_member_keys: false, monthly_token_cap_per_user: 500000, allow_private_endpoint: false,
  anthropic_models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'], default_model: 'claude-opus-5-5',
  providers: {
    anthropic: { enabled: true, model: 'claude-opus-5-5', key_set: true, label: 'Anthropic (Claude)' },
    openai: { enabled: false, model: '', key_set: false, label: 'OpenAI' },
    gemini: { enabled: false, model: '', key_set: false, label: 'Google Gemini' },
    compatible: { enabled: false, model: '', key_set: false, label: 'compatible', base_url: '' },
  },
}
const status: AssistantStatus = {
  available: true, enabled: true, reason: '', provider: 'anthropic', provider_label: 'Anthropic (Claude)', model: 'claude-opus-5-5', consented: true,
  disclosure_version: 1, fields: [], allow_member_keys: true, own_key_set: true, operator_key_set: true,
}

describe('OwnerAssistantSettings', () => {
  it('shows providers, models (Anthropic picker), key presence never a key, base URL, private endpoint, cap and member keys', () => {
    const html = renderToStaticMarkup(<OwnerAssistantSettings saved={saved} draft={draftFrom(saved)} connected busy={false} error={null} message={null} tests={{}} onChange={noop} onSave={noop} onTest={noop} />)
    for (const s of ['Turn on the assistant', 'Anthropic (Claude)', 'OpenAI', 'Google Gemini', 'Compatible endpoint', 'claude-sonnet-5-5', 'claude-haiku-5-5',
      'A key is saved', 'Remove saved key', 'Base URL', 'Allow private endpoints', 'Let members bring their own key', 'Monthly tokens per person', 'Test connection']) {
      expect(html).toContain(s)
    }
    expect((html.match(/type="password"/g) ?? []).length).toBe(4)
    expect(html).not.toMatch(/type="password"[^>]*value="[^"]+"/)
  })
  it('reports a failed connection test with its code', () => {
    const html = renderToStaticMarkup(<OwnerAssistantSettings saved={saved} draft={draftFrom(saved)} connected busy={false} error={null} message={null}
      tests={{ compatible: { ok: false, code: 'no_tool_support', message: 'the endpoint rejects tool definitions' } }} onChange={noop} onSave={noop} onTest={noop} />)
    expect(html).toContain('no_tool_support')
  })
  it('sends keys only when typed or removed', () => {
    const d = draftFrom(saved)
    expect(inputFrom(d).keys).toEqual({})
    expect(inputFrom({ ...d, keys: { anthropic: '' } }).keys).toEqual({ anthropic: '' })
    expect(inputFrom(d).providers?.compatible).toEqual({ enabled: false, model: '', base_url: '' })
  })
})

describe('Test connection uses the values on screen (assistant-test-unsaved-settings)', () => {
  it('sends the typed model, base URL, private switch and key; no key when untouched, "" after Remove saved key', () => {
    const d = draftFrom(saved)
    const typed = { ...d, providers: { ...d.providers, openai: { enabled: false, model: ' gpt-5.4-mini ', base_url: '' } }, keys: { openai: 'sk-typed' } }
    expect(testDraft(typed, 'openai')).toEqual({ model: 'gpt-5.4-mini', allow_private_endpoint: false, key: 'sk-typed' })
    expect(testDraft(d, 'anthropic')).toEqual({ model: 'claude-opus-5-5', allow_private_endpoint: false })
    expect(testDraft({ ...d, keys: { anthropic: '' } }, 'anthropic').key).toBe('')
    const compat = { ...d, allow_private_endpoint: true, providers: { ...d.providers, compatible: { enabled: false, model: 'llama', base_url: ' http://192.168.1.20:11434/v1 ' } } }
    expect(testDraft(compat, 'compatible')).toEqual({ model: 'llama', base_url: 'http://192.168.1.20:11434/v1', allow_private_endpoint: true })
  })
  it('knows when a test covered unsaved values', () => {
    const d = draftFrom(saved)
    expect(testIsUnsaved(testDraft(d, 'anthropic'), saved, 'anthropic')).toBe(false)
    expect(testIsUnsaved(testDraft({ ...d, keys: { anthropic: 'sk-new' } }, 'anthropic'), saved, 'anthropic')).toBe(true)
    expect(testIsUnsaved({ model: 'gpt-x', allow_private_endpoint: false }, saved, 'openai')).toBe(true)
    expect(SAVE_TO_USE).toBe('Connection works. Save to use these settings.')
  })
  it('asks for a model id instead of testing an empty one', () => {
    const html = renderToStaticMarkup(<OwnerAssistantSettings saved={saved} draft={draftFrom(saved)} connected busy={false} error={null} message={null} tests={{}} onChange={noop} onSave={noop} onTest={noop} />)
    // Anthropic has a model; OpenAI, Gemini and the compatible endpoint do not.
    expect((html.match(/data-test-needs-model/g) ?? []).length).toBe(3)
    expect(html).toContain('Enter a model id to test')
  })
  it('hides a result once the tested values change', () => {
    const d = draftFrom(saved)
    const tests = { anthropic: { ok: false, code: 'provider_auth', message: 'rejected' } }
    const same = renderToStaticMarkup(<OwnerAssistantSettings saved={saved} draft={d} connected busy={false} error={null} message={null} tests={tests}
      testedWith={{ anthropic: JSON.stringify(testDraft(d, 'anthropic')) }} onChange={noop} onSave={noop} onTest={noop} />)
    expect(same).toContain('provider_auth')
    const edited = { ...d, providers: { ...d.providers, anthropic: { ...d.providers.anthropic, model: 'claude-haiku-5-5' } } }
    const changed = renderToStaticMarkup(<OwnerAssistantSettings saved={saved} draft={edited} connected busy={false} error={null} message={null} tests={tests}
      testedWith={{ anthropic: JSON.stringify(testDraft(d, 'anthropic')) }} onChange={noop} onSave={noop} onTest={noop} />)
    expect(changed).not.toContain('provider_auth')
  })
})

describe('OwnerAssistantSummary (settings-redesign)', () => {
  const summary = (over: Partial<AssistantOwnerSettings> = {}, connected = true) =>
    renderToStaticMarkup(<OwnerAssistantSummary saved={{ ...saved, ...over }} connected={connected} onConfigure={noop} />)
  it('shows the state at a glance with the form behind Configure', () => {
    const html = summary()
    expect(html).toContain('data-assistant-owner')
    expect(html).toMatch(/data-status="ok"[^>]*><span[^>]*><\/span><span[^>]*>On<\/span>/)
    expect(html).toContain('Everyone uses Anthropic (Claude) (claude-opus-5-5).')
    expect(html).toContain('500,000 tokens')
    expect(html).toContain('Not allowed.')
    expect(html).toMatch(/<button[^>]*>.*Configure<\/button>/)
    expect(html).not.toContain('type="password"')
  })
  it('says when it is off, flags a provider without a key and disables Configure offline', () => {
    const html = summary({ enabled: false, monthly_token_cap_per_user: 0, providers: { ...saved.providers, openai: { enabled: true, model: 'x', key_set: false, label: 'OpenAI' } } })
    expect(html).toMatch(/data-status="off"[^>]*><span[^>]*><\/span><span[^>]*>Off<\/span>/)
    expect(html).toContain('OpenAI · no key')
    expect(html).toContain('Unlimited')
    expect(summary({}, false)).toMatch(/<button[^>]*disabled=""[^>]*>.*Configure/)
  })
})

describe('UserAssistantSettings', () => {
  const render = (over: Partial<Parameters<typeof UserAssistantSettings>[0]> = {}) => renderToStaticMarkup(
    <UserAssistantSettings status={status} usage={{ month: '2026-10', input_tokens: 80000, output_tokens: 10000, total_tokens: 90000, turns: 12, cap: 500000, resets_at: '2026-11-01' }}
      autoApply={false} connected busy={false} error={null} cleared={false} onWithdraw={noop} onOwnKey={noop} onAutoApply={noop} onClear={noop} {...over} />)
  it('shows consent, usage, own key, auto-apply (off) and clearing conversations', () => {
    const html = render()
    expect(html).toContain('Withdraw consent')
    expect(html).toContain('90,000 tokens in 12 answers · 18%')
    // The reset date follows the date format (date-time-preferences).
    expect(html).toContain(`resets ${formatDate('2026-11-01', 'compact')}`)
    expect(html).toContain('Your key is saved')
    expect(html).toContain('Apply small changes without review (this device)')
    expect(html).not.toMatch(/type="checkbox"[^>]*checked=""/)
    expect(html).toContain('Clear conversations on this device')
    expect(html).toContain('role="switch"')
    expect(html).toContain('Accepted')
  })
  it('explains an encrypted account', () => {
    expect(render({ status: { ...status, reason: 'encryption_enabled', available: false } })).toContain('end-to-end encrypted')
  })
})

// assistant-member-provider: the member's own provider, model and key.
const models = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']
const serverStatus: AssistantStatus = {
  ...status, consented: false, own_key_set: false, source: 'server', own_key_in_use: false, server_provider: 'anthropic', server_provider_label: 'Anthropic (Claude)',
  server_model: 'claude-opus-5-5', server_own_key_set: false, own_provider: null, member_providers: ['anthropic', 'openai', 'gemini'], anthropic_models: models, cap_member_keys: false,
}
const ownStatus: AssistantStatus = {
  ...serverStatus, source: 'own', provider: 'openai', provider_label: 'OpenAI', model: 'gpt-member-1', own_key_set: true, own_key_in_use: true,
  own_provider: { provider: 'openai', provider_label: 'OpenAI', model: 'gpt-member-1', key_set: true },
}

describe('Owner: member keys and the cap', () => {
  it('offers counting member keys only while member keys are allowed, and shows how many use their own', () => {
    const on = { ...saved, allow_member_keys: true, cap_member_keys: false, own_key_members: 2 }
    const html = renderToStaticMarkup(<OwnerAssistantSettings saved={on} draft={draftFrom(on)} connected busy={false} error={null} message={null} tests={{}} onChange={noop} onSave={noop} onTest={noop} />)
    expect(html).toContain('Count members’ own keys toward the monthly limit')
    expect(html).toContain('2 people use their own provider and key')
    expect(html).toContain('compatible endpoint is never offered to members')
    const off = renderToStaticMarkup(<OwnerAssistantSettings saved={saved} draft={draftFrom(saved)} connected busy={false} error={null} message={null} tests={{}} onChange={noop} onSave={noop} onTest={noop} />)
    expect(off).not.toContain('Count members’ own keys')
    expect(inputFrom({ ...draftFrom(on), cap_member_keys: true }).cap_member_keys).toBe(true)
    expect(draftFrom(saved).cap_member_keys).toBe(false)
  })
})

describe('Which assistant you use', () => {
  const render = (s: AssistantStatus, over: Partial<Parameters<typeof UserAssistantSettings>[0]> = {}) => renderToStaticMarkup(
    <UserAssistantSettings status={s} usage={null} autoApply={false} connected busy={false} error={null} cleared={false} onWithdraw={noop} onOwnKey={noop}
      onAutoApply={noop} onClear={noop} onSaveOwn={async () => true} onTestOwn={noop} {...over} />)
  it('starts on the server’s assistant, naming the owner’s provider', () => {
    const html = render(serverStatus)
    expect(html).toContain('Which assistant you use')
    expect(html).toContain('The server’s assistant')
    expect(html).toContain('Anthropic (Claude) (claude-opus-5-5), set up by the server owner')
    expect(html).toContain('My own provider and key')
    expect(html).toContain('do not count toward the server’s monthly limit')
    expect(html).not.toContain('Test connection')
    expect(html).not.toContain('type="password"')
  })
  it('keeps a key stored for the server’s provider usable and removable', () => {
    const html = render({ ...serverStatus, server_own_key_set: true, own_key_set: true, own_key_in_use: true })
    expect(html).toContain('Your key is saved for Anthropic (Claude)')
    expect(html).toContain('Remove my key')
  })
  it('shows the member’s provider, model, key presence, test and the disclosure; never the compatible endpoint', () => {
    const html = render(ownStatus)
    expect(html).toContain('Provider: <strong>OpenAI</strong> (gpt-member-1), with your own key')
    expect(html).toMatch(/<option value="openai" selected="">OpenAI<\/option>/)
    expect(html).toContain('<option value="gemini">Google Gemini</option>')
    expect(html).toContain('<option value="anthropic">Anthropic (Claude)</option>')
    expect(html).not.toContain('value="compatible"')
    expect(html).toContain('value="gpt-member-1"')
    expect(html).toContain('Your key is saved; type to replace it')
    expect(html).toContain('Requests go from this server to OpenAI with your key')
    expect(html).toContain('Test connection')
    expect(html).not.toMatch(/type="password"[^>]*value="[^"]+"/)
  })
  it('shows a test result until the tested values change, and offers Test before saving', () => {
    expect(render(ownStatus, { ownTest: { ok: true, message: 'Connected.' } })).toContain('Connected.')
    expect(render(ownStatus)).not.toContain('data-test-needs-model')
  })
  it('offers only the listed Anthropic models', () => {
    const html = render({ ...ownStatus, provider: 'anthropic', provider_label: 'Anthropic (Claude)', model: 'claude-haiku-5-5',
      own_provider: { provider: 'anthropic', provider_label: 'Anthropic (Claude)', model: 'claude-haiku-5-5', key_set: true } })
    for (const m of models) expect(html).toContain(`<option value="${m}"`)
    expect(html).toMatch(/<option value="claude-haiku-5-5" selected="">/)
  })
  it('says when the owner counts own keys toward the limit', () => {
    expect(render({ ...ownStatus, cap_member_keys: true })).toContain('still count toward the server’s monthly limit')
  })
  it('keeps a choice the owner no longer allows, with a way to forget it', () => {
    const html = render({ ...ownStatus, allow_member_keys: false, source: 'server', provider: 'anthropic', provider_label: 'Anthropic (Claude)' })
    expect(html).not.toContain('Which assistant you use')
    expect(html).toContain('Your own provider (OpenAI) is kept but unused')
    expect(html).toContain('Forget my provider and key')
  })
  it('validates the form before sending', () => {
    const d = ownDraftFrom(ownStatus)
    expect(d).toEqual({ mode: 'own', provider: 'openai', model: 'gpt-member-1', key: '' })
    expect(ownInputFrom(d, ownStatus)).toEqual({ own_provider: 'openai', own_model: 'gpt-member-1' })
    expect(ownInputFrom({ ...d, key: ' sk-new ' }, ownStatus)).toEqual({ own_provider: 'openai', own_model: 'gpt-member-1', own_key: 'sk-new' })
    expect(ownInputFrom({ ...d, provider: 'gemini', model: 'gemini-2.5-flash' }, ownStatus)).toBe('Enter your API key for Google Gemini.')
    expect(ownInputFrom({ ...d, model: 'gpt 4' }, ownStatus)).toMatch(/model id/)
    expect(ownInputFrom({ ...d, model: 'a'.repeat(101) }, ownStatus)).toMatch(/model id/)
    expect(ownInputFrom({ ...d, provider: 'anthropic', model: 'claude-custom', key: 'k' }, ownStatus)).toMatch(/offered Anthropic models/)
    expect(ownInputFrom({ ...d, mode: 'server' }, ownStatus)).toEqual({ own_provider: '' })
    expect(ownDraftFrom(serverStatus)).toEqual({ mode: 'server', provider: 'anthropic', model: 'claude-opus-5-5', key: '' })
  })
  it('shows usage on the member’s own key apart from the limit', () => {
    const html = render(ownStatus, { usage: { month: '2026-10', input_tokens: 2000, output_tokens: 500, total_tokens: 2500, turns: 4, cap: 10000, resets_at: '2026-11-01',
      counted_tokens: 1000, cap_member_keys: false, own_key: { input_tokens: 1200, output_tokens: 300, total_tokens: 1500, turns: 3 } } })
    expect(html).toContain('2,500 tokens in 4 answers · 10% of your 10,000-token limit')
    expect(html).toContain('1,500 on your own key, not counted toward the limit')
  })
})

describe('Assistant card structure (settings-refresh D9; in-app-assistant "Assistant card structure")', () => {
  it("Member's view: the status line, consent and own key under For you, and the usage meter", () => {
    expect(assistantStatusLine(status)).toBe('On for everyone')
    expect(assistantStatusLine({ ...status, source: 'own' })).toBe('On, using your own key')
    const html = renderToStaticMarkup(
      <UserAssistantSettings status={status} usage={{ month: '2026-10', input_tokens: 1, output_tokens: 1, total_tokens: 90000, turns: 12, cap: 500000, resets_at: '2026-11-01' }}
        autoApply={false} connected busy={false} error={null} cleared={false} onWithdraw={noop} onOwnKey={noop} onAutoApply={noop} onClear={noop} />)
    expect(html).toContain('Withdraw consent')
    expect(html).toContain('data-usage-meter')
    expect(html).toContain('aria-valuenow="18"')
  })

  it("Owner's view while off: the status line says off, and the owner form groups Provider, Limits and the on-device assistant", () => {
    expect(assistantStatusLine({ ...status, enabled: false, reason: 'disabled' })).toBe('Off: the owner has not turned it on')
    const form = renderToStaticMarkup(<OwnerAssistantSettings saved={{ ...saved, enabled: false }} draft={draftFrom({ ...saved, enabled: false })} connected busy={false} error={null} message={null}
      tests={{}} onChange={noop} onSave={noop} onTest={noop} />)
    const groups = [...form.matchAll(/data-assistant-group="([^"]+)"/g)].map((m) => m[1])
    expect(groups).toEqual(['Provider', 'Limits', 'device'])
    expect(form.indexOf('Monthly tokens per person')).toBeGreaterThan(form.indexOf('data-assistant-group="Limits"'))
  })
})
