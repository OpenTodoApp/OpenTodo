import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AssistantStatus } from '../lib/assistantStatus'
import type { AssistantOwnerSettings } from '../lib/assistantTypes'
import { draftFrom, inputFrom, OwnerAssistantSettings, UserAssistantSettings } from './assistant/AssistantSettings'

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

describe('UserAssistantSettings', () => {
  const render = (over: Partial<Parameters<typeof UserAssistantSettings>[0]> = {}) => renderToStaticMarkup(
    <UserAssistantSettings status={status} usage={{ month: '2026-10', input_tokens: 80000, output_tokens: 10000, total_tokens: 90000, turns: 12, cap: 500000, resets_at: '2026-11-01' }}
      autoApply={false} connected busy={false} error={null} cleared={false} onWithdraw={noop} onOwnKey={noop} onAutoApply={noop} onClear={noop} {...over} />)
  it('shows consent, usage, own key, auto-apply (off) and clearing conversations', () => {
    const html = render()
    expect(html).toContain('Withdraw consent')
    expect(html).toContain('90,000 tokens in 12 answers · 18%')
    expect(html).toContain('resets 2026-11-01')
    expect(html).toContain('Your key is saved')
    expect(html).toContain('Apply small changes without review (this device)')
    expect(html).not.toMatch(/type="checkbox"[^>]*checked=""/)
    expect(html).toContain('Clear conversations on this device')
  })
  it('explains an encrypted account', () => {
    expect(render({ status: { ...status, reason: 'encryption_enabled', available: false } })).toContain('end-to-end encrypted')
  })
})
