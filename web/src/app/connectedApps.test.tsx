// @vitest-environment happy-dom
// The connected AI apps (OpenSpec change connected-apps-list): listed with the
// sessions, each with its access, and disconnected only after the confirmation.
import { describe, expect, it, vi } from 'vitest'
import { click, render, waitFor } from '../ui/test-utils'
import { ConnectedApps } from './ConnectedApps'

const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)

describe('ConnectedApps', () => {
  it('lists each app with its access and disconnects one after confirming', async () => {
    const now = Date.UTC(2026, 10, 10, 12)
    const disconnect = vi.fn(async () => {})
    const load = async () => [
      { id: 'g1', clientId: 'c1', clientName: 'Gemini', scope: 'agent' as const, workspaces: [], createdAt: now - 86_400_000, lastUsedAt: now - 60_000 },
      { id: 'g2', clientId: 'c2', clientName: 'ChatGPT', scope: 'read' as const, workspaces: ['w-gone'], createdAt: now - 86_400_000, lastUsedAt: null },
    ]
    const { unmount } = await render(<ConnectedApps load={load} disconnect={disconnect} now={now} />)
    const rows = () => document.querySelector<HTMLElement>('[data-testid="connected-apps"]')
    await waitFor(() => rows() !== null, 'the rows')
    const text = rows()!.textContent!
    expect(text).toContain('Gemini')
    expect(text).toContain('Can make changes')
    expect(text).toContain('ChatGPT')
    expect(text).toContain('Read only')
    expect(text).toContain('Never used')
    expect(text).toContain('Only a removed workspace')

    await click(document.querySelector<HTMLElement>('[aria-label="Actions for Gemini"]')!)
    await waitFor(() => !!button('Disconnect'), 'the menu')
    await click(button('Disconnect')!)
    await waitFor(() => !!document.querySelector('[data-testid="confirm-dialog"]'), 'the confirmation')
    expect(disconnect).not.toHaveBeenCalled()
    const confirm = [...document.querySelectorAll<HTMLElement>('[data-testid="confirm-dialog"] button')].find((b) => b.textContent?.trim() === 'Disconnect')!
    await click(confirm)
    await waitFor(() => !rows()!.textContent!.includes('Gemini'), 'the row removed')
    expect(disconnect).toHaveBeenCalledWith('g1')
    expect(rows()!.textContent).toContain('ChatGPT')
    await unmount()
  })

  it('shows nothing while no app is connected', async () => {
    const { unmount } = await render(<ConnectedApps load={async () => []} />)
    expect(document.querySelector('[data-testid="connected-apps"]')).toBeNull()
    await unmount()
  })
})
