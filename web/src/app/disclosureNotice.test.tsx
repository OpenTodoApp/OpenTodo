// @vitest-environment happy-dom
// assistant-disclosure-notice 2.1: the one-time notice that the assistant's list
// is now complete. Shown only while the server says so and only to a consented
// person; Review the list shows the list in place, Got it and Turn off the
// assistant update the status, and both need a connection.
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AssistantStatus } from '../lib/assistantStatus'
import { applyLanguagePreference } from '../lib/i18n'
import it_ from '../locales/it.json'
import { click, render, waitFor } from '../ui/test-utils'
import { AssistantPanelBody, type PanelViewProps } from './assistant/AssistantPanel'
import { DisclosureNotice, DisclosureNoticeView } from './assistant/DisclosureNotice'

const api = vi.hoisted(() => ({
  assistantDisclosureSeen: vi.fn(),
  setMyAssistant: vi.fn(),
}))
vi.mock('../lib/api', async (orig) => ({ ...(await orig<typeof import('../lib/api')>()), api }))
vi.mock('../lib/relay', () => ({ refreshCapabilities: vi.fn() }))

const noop = () => {}
const status: AssistantStatus = {
  available: true, enabled: true, reason: '', provider: 'anthropic', provider_label: 'Anthropic (Claude)', model: 'claude-opus-5-5', consented: true,
  consent: { accepted_at: 1, disclosure_version: 2, provider: 'anthropic', seen_version: 0 }, disclosure_notice: true,
  disclosure_version: 4, fields: ['task titles and descriptions', 'notes', 'tracked time and its notes'], allow_member_keys: false, own_key_set: false, operator_key_set: true,
}

/** The panel body in a DOM (the notice loads lazily), once it settled. */
async function body(over: Partial<AssistantStatus> = {}, expectNotice = true) {
  const p: PanelViewProps = {
    status: { ...status, ...over }, connected: true, messages: [], streaming: null, announce: '', statusAnnounce: '', review: null, result: null, reviewBusy: false, error: null,
    draft: '', consentBusy: false, consentError: null, threads: null, onToggle: noop, onApply: noop, onDiscard: noop, onUndo: noop, onDraft: noop,
    onSend: noop, onStop: noop, onAccept: noop, onPickThread: noop,
  }
  const { container, unmount } = await render(<AssistantPanelBody {...p} />)
  // Without the notice nothing loads lazily, so the first render is final.
  if (expectNotice) await waitFor(() => !!container.querySelector('[data-disclosure-notice]'), 'the notice')
  const html = container.innerHTML
  await unmount()
  return html
}

describe('DisclosureNotice', () => {
  afterEach(async () => {
    vi.clearAllMocks()
    await applyLanguagePreference('en', ['en-US'])
  })

  it('shows in the panel above the conversation only for an older consent', async () => {
    const html = await body()
    expect(html).toContain('data-disclosure-notice')
    expect(html).toContain('is now complete')
    expect(html).toContain('Review the list')
    expect(html).toContain('Turn off the assistant')
    expect(html).toContain('Got it')
    // The list stays closed until asked for; nothing is paused.
    expect(html).not.toContain('data-disclosure-notice-list')
    expect(html.indexOf('data-disclosure-notice')).toBeLessThan(html.indexOf('data-assistant-live'))
    expect(await body({ disclosure_notice: false }, false)).not.toContain('data-disclosure-notice')
    expect(await body({ disclosure_notice: undefined }, false)).not.toContain('data-disclosure-notice')
    // Someone who must accept again reads the full disclosure instead.
    const asked = await body({ consented: false }, false)
    expect(asked).not.toContain('data-disclosure-notice')
    expect(asked).toContain('data-assistant-consent')
  })

  it('disables Got it and Turn off offline and says why', () => {
    const html = renderToStaticMarkup(<DisclosureNoticeView fields={status.fields} device={false} connected={false} onSeen={noop} onTurnOff={noop} />)
    expect(html).toContain('needs a connection')
    expect(html.match(/disabled=""/g)?.length).toBe(2)
  })

  it('shows the list in place in the reader’s language, without the routines paragraph on a device', async () => {
    await applyLanguagePreference('it', ['en-US'])
    const catalog = it_ as Record<string, string>
    const html = renderToStaticMarkup(<DisclosureNoticeView fields={status.fields} device={false} connected open onSeen={noop} onTurnOff={noop} />)
    for (const f of status.fields) expect(html).toContain(catalog[f])
    expect(html).toContain('data-consent-routines')
    expect(renderToStaticMarkup(<DisclosureNoticeView fields={status.fields} device connected open onSeen={noop} onTurnOff={noop} />)).not.toContain('data-consent-routines')
  })

  it('Review the list opens it; Got it records the version and hides the notice', async () => {
    const seen = { ...status, disclosure_notice: false, consent: { ...status.consent!, seen_version: 4 } }
    api.assistantDisclosureSeen.mockResolvedValue(seen)
    const onStatus = vi.fn()
    const { container, rerender } = await render(<DisclosureNotice status={status} connected onStatus={onStatus} />)
    const review = container.querySelector<HTMLButtonElement>('[data-disclosure-review]')!
    expect(review.getAttribute('aria-expanded')).toBe('false')
    await click(review)
    await waitFor(() => !!container.querySelector('[data-disclosure-notice-list]'), 'the list')
    expect(container.querySelector('[data-disclosure-notice-list]')!.textContent).toContain('tracked time and its notes')
    expect(review.getAttribute('aria-expanded')).toBe('true')
    await click(container.querySelector('[data-disclosure-seen]')!)
    await waitFor(() => onStatus.mock.calls.length === 1, 'the new status')
    expect(api.assistantDisclosureSeen).toHaveBeenCalledTimes(1)
    expect(api.setMyAssistant).not.toHaveBeenCalled()
    await rerender(<DisclosureNotice status={onStatus.mock.calls[0][0]} connected onStatus={onStatus} />)
    expect(container.querySelector('[data-disclosure-notice]')).toBeNull()
  })

  it('Turn off the assistant withdraws the consent', async () => {
    api.setMyAssistant.mockResolvedValue({ ...status, consented: false, consent: undefined, disclosure_notice: false })
    const onStatus = vi.fn()
    const { container } = await render(<DisclosureNotice status={status} connected onStatus={onStatus} />)
    await click(container.querySelector('[data-disclosure-off]')!)
    await waitFor(() => onStatus.mock.calls.length === 1, 'the new status')
    expect(api.setMyAssistant).toHaveBeenCalledWith({ consent: false })
    expect(onStatus.mock.calls[0][0].consented).toBe(false)
  })

  it('shows the error when Got it fails', async () => {
    api.assistantDisclosureSeen.mockRejectedValue(new Error('Server unreachable'))
    const { container } = await render(<DisclosureNotice status={status} connected />)
    await click(container.querySelector('[data-disclosure-seen]')!)
    await waitFor(() => container.querySelector('[role="alert"]')?.textContent === 'Server unreachable', 'the error')
    expect(container.querySelector('[data-disclosure-notice]')).not.toBeNull()
  })
})
