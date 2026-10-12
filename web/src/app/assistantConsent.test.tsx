import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AssistantStatus } from '../lib/assistantStatus'
import { AssistantConsent } from './assistant/AssistantConsent'

const status: AssistantStatus = {
  available: true, enabled: true, reason: '', provider: 'anthropic', provider_label: 'Anthropic (Claude)', model: 'claude-opus-5-5', consented: false,
  disclosure_version: 1, fields: ['task titles and descriptions', 'project, section and label names', 'comments', 'names of members of shared projects'],
  allow_member_keys: false, own_key_set: false, operator_key_set: true,
}
const render = (over: Partial<AssistantStatus> = {}, connected = true) =>
  renderToStaticMarkup(<AssistantConsent status={{ ...status, ...over }} connected={connected} busy={false} error={null} onAccept={() => {}} />)

describe('AssistantConsent', () => {
  it('names the provider, the model and every field that may be sent', () => {
    const html = render()
    expect(html).toContain('<strong>Anthropic (Claude)</strong>')
    expect(html).toContain('claude-opus-5-5')
    for (const f of status.fields) expect(html).toContain(f)
    expect(html).toContain('Nothing is sent before you accept')
    expect(html).toContain('Accept and continue')
    expect(html).not.toContain('type="password"')
  })
  it('offers an own key only when the owner allows it', () => {
    expect(render({ allow_member_keys: true })).toContain('type="password"')
  })
  it('asks again after the owner changed the provider', () => {
    expect(render({ provider: 'openai', provider_label: 'OpenAI', consent: { accepted_at: 1, disclosure_version: 1, provider: 'anthropic' } })).toContain('changed the model provider')
  })
  it('names the member’s own provider, says the key is theirs, and offers no key field (assistant-member-provider)', () => {
    const html = render({ allow_member_keys: true, source: 'own', provider: 'gemini', provider_label: 'Google Gemini', model: 'gemini-2.5-flash' })
    expect(html).toContain('from this server to <strong>Google Gemini</strong>')
    expect(html).toContain('with your own API key')
    expect(html).not.toContain('Your server owner chose it')
    expect(html).not.toContain('type="password"')
    expect(render({ source: 'own', provider: 'gemini', provider_label: 'Google Gemini', consent: { accepted_at: 1, disclosure_version: 1, provider: 'openai' } })).toContain('The model provider changed.')
  })
  it('needs a connection to accept', () => {
    expect(render({}, false)).toMatch(/disabled=""[^>]*data-assistant-accept|data-assistant-accept[^>]*disabled=""/)
  })
})
