// The assistant panel without a DOM (in-app-assistant task 5.2): the pure body
// and sheet are rendered to static markup for each state; focus trapping and
// return come from the overlay module (overlay.test.ts) through useOverlay.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEMO_STATUS, showLauncher, type AssistantStatus } from '../lib/assistantStatus'
import { AssistantPanelBody, AssistantSheet, Composer, ENCRYPTED_MESSAGE, OFFLINE_MESSAGE, type PanelViewProps } from './assistant/AssistantPanel'

const noop = () => {}
const status: AssistantStatus = {
  available: true, enabled: true, reason: '', provider: 'anthropic', provider_label: 'Anthropic (Claude)', model: 'claude-opus-5-5', consented: true,
  disclosure_version: 1, fields: ['task titles and descriptions', 'comments'], allow_member_keys: false, own_key_set: false, operator_key_set: true,
}

function body(over: Partial<PanelViewProps> = {}) {
  const p: PanelViewProps = {
    status, connected: true, messages: [], streaming: null, announce: '', statusAnnounce: '', review: null, result: null, reviewBusy: false, error: null,
    draft: '', consentBusy: false, consentError: null, threads: null, onToggle: noop, onApply: noop, onDiscard: noop, onUndo: noop, onDraft: noop,
    onSend: noop, onStop: noop, onAccept: noop, onPickThread: noop, ...over,
  }
  return renderToStaticMarkup(<AssistantPanelBody {...p} />)
}

describe('AssistantSheet', () => {
  it('is a labelled modal dialog on the overlay module: side sheet from 640 px, full screen below, close first', () => {
    const html = renderToStaticMarkup(<AssistantSheet title="Assistant" onClose={noop} footer={<p>composer</p>}><p>content</p></AssistantSheet>)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('data-overlay="dialog"')
    expect(html).toContain('data-overlay-root')
    // Full width on phones, a right-hand sheet from 640 px.
    expect(html).toContain('h-full w-full')
    expect(html).toContain('sm:max-w-md')
    expect(html).toContain('justify-end')
    // Above the on-screen keyboard and clear of the notch / home indicator.
    expect(html).toContain('--vv-bottom')
    expect(html).toContain('safe-area-inset-bottom')
    expect(html.indexOf('data-overlay-close')).toBeLessThan(html.indexOf('content'))
    const id = /aria-labelledby="([^"]+)"/.exec(html)?.[1]
    expect(html).toContain(`id="${id}"`)
  })
})

describe('AssistantPanelBody', () => {
  it('announces streamed text in a polite live region and status lines in another', () => {
    const html = body({ streaming: { text: 'You have two tasks. The first', status: ['Looking at Today…'] }, announce: 'You have two tasks.', statusAnnounce: 'Looking at Today…' })
    expect(html).toMatch(/aria-live="polite" data-assistant-live="true">You have two tasks\.</)
    expect(html).toMatch(/aria-live="polite" data-assistant-status="true">Looking at Today…</)
    expect(html).toContain('aria-busy="true"')
  })

  it('shows the encrypted-account explanation and no consent or composer', () => {
    const html = body({ status: { ...status, available: false, reason: 'encryption_enabled', consented: false } })
    expect(html).toContain(ENCRYPTED_MESSAGE.replace('’', '’'))
    expect(html).not.toContain('data-assistant-consent')
    expect(html).not.toContain('textarea')
  })

  it('tells an encrypted account how to use the assistant: turning encryption off in Settings', () => {
    const html = body({ status: { ...status, available: false, reason: 'encryption_enabled', consented: false } })
    expect(html).toContain('data-assistant-encryption-hint')
    expect(html).toContain('href="/settings/encryption"')
  })

  it('asks for consent before the first message, naming the provider and the fields', () => {
    const html = body({ status: { ...status, consented: false } })
    expect(html).toContain('data-assistant-consent')
    expect(html).toContain('Anthropic (Claude)')
    expect(html).toContain('task titles and descriptions')
    expect(html).not.toContain('aria-label="Conversation"')
  })

  it('renders messages, usage, cut-off and refusal notes', () => {
    const html = body({ messages: [
      { role: 'user', text: 'what is due?', at: 1 },
      { role: 'assistant', text: '**Two** tasks', usage: { input: 1000, output: 240, month_total: 90000, cap: 500000 }, at: 2 },
      { role: 'assistant', text: 'partial', stop: 'max_tokens', at: 3 },
      { role: 'assistant', text: '', stop: 'refusal', error: 'The model declined this request.', at: 4 },
    ] })
    expect(html).toContain('<strong>Two</strong>')
    expect(html).toContain('1,240 tokens · this month 18% of your limit')
    expect(html).toContain('Cut off')
    expect(html).toContain('The model declined this request.')
  })

  it('lists earlier conversations on this device', () => {
    const html = body({ threads: [{ id: 't', title: 'Plan my week', messages: [], created_at: 1, updated_at: Date.UTC(2026, 9, 12), provider: 'anthropic', usage: { input: 0, output: 0 } }] })
    expect(html).toContain('Earlier conversations on this device')
    expect(html).toContain('Plan my week')
  })

  it('explains the demo and a server where it is off', () => {
    expect(body({ status: DEMO_STATUS })).toContain('not available on the demo')
    expect(body({ status: { ...status, enabled: false, available: false, reason: 'disabled' } })).toContain('has not turned the assistant on')
  })
})

describe('Composer', () => {
  it('is disabled offline with the connection note', () => {
    const html = renderToStaticMarkup(<Composer draft="" onDraft={noop} onSend={noop} onStop={noop} streaming={false} connected={false} disabled={false} />)
    expect(html).toMatch(/<textarea[^>]*disabled=""/)
    expect(html).toContain(OFFLINE_MESSAGE)
  })
  it('offers Stop while an answer streams', () => {
    const html = renderToStaticMarkup(<Composer draft="x" onDraft={noop} onSend={noop} onStop={noop} streaming connected disabled={false} />)
    expect(html).toContain('>Stop<')
    expect(html).not.toContain('>Send<')
  })
})

describe('launcher', () => {
  it('is offered only when the owner turned the assistant on, never on the demo', () => {
    expect(showLauncher(null)).toBe(false)
    expect(showLauncher({ ...status, enabled: false })).toBe(false)
    expect(showLauncher(DEMO_STATUS)).toBe(false)
    expect(showLauncher(status)).toBe(true)
    expect(showLauncher({ ...status, available: false, reason: 'encryption_enabled' })).toBe(true)
  })
})
