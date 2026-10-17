// @vitest-environment happy-dom
// Webhook rows keep their actions in a menu; offline they are disabled, and Delete confirms.
import { describe, expect, it, vi } from 'vitest'
import type { Webhook } from '../lib/types'
import { click, flush, render } from '../ui/test-utils'
import { WebhooksView, type WebhooksViewProps } from './WebhooksPanel'

const noop = () => {}
const hook: Webhook = {
  id: 'w1', url: 'https://n8n.example.com/x', events: ['task.completed'], projectId: null,
  enabled: true, disabledReason: null, consecutiveFailures: 0, createdAt: 1, updatedAt: 1,
}
const props = (over: Partial<WebhooksViewProps>): WebhooksViewProps => ({
  isOwner: false, connected: true, webhooks: [hook], projects: [], allowPrivate: null, busy: false, error: null, draft: null, secret: null,
  testResults: {}, log: null, onDraftChange: noop, onSave: noop, onDismissSecret: noop, onToggleEnabled: noop, onTest: noop,
  onDelete: noop, onOpenLog: noop, onRefreshLog: noop, onRedeliver: noop, onPolicyChange: noop, ...over,
})
const items = () => Object.fromEntries([...document.querySelectorAll('[role^="menuitem"]')].map((i) => [i.getAttribute('data-menu-label'), i as HTMLButtonElement]))

describe('webhook row menu', () => {
  it('disables Send test, Edit, Disable and Delete offline; the delivery log stays available', async () => {
    const r = await render(<WebhooksView {...props({ connected: false })} />)
    await click(r.container.querySelector('[aria-label^="Actions for webhook"]')!)
    await flush(20)
    const m = items()
    for (const label of ['Send test', 'Edit', 'Disable', 'Delete']) expect(m[label].disabled, label).toBe(true)
    expect(m['Delivery log'].disabled).toBe(false)
    await r.unmount()
  })

  it('online, Delete asks the panel to confirm', async () => {
    const onDelete = vi.fn()
    const r = await render(<WebhooksView {...props({ onDelete })} />)
    await click(r.container.querySelector('[aria-label^="Actions for webhook"]')!)
    await flush(20)
    await click(items()['Delete'])
    expect(onDelete).toHaveBeenCalledWith(hook)
    await r.unmount()
  })
})
