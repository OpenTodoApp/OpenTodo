// @vitest-environment happy-dom
import { useRef, useState } from 'react'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { click, flush, key, render } from '../test-utils'
import { ConfirmDialog } from './ConfirmDialog'
import { EmptyState } from './EmptyState'
import { ListRow } from './ListRow'
import { SettingRow, SettingsSection } from './SettingsSection'
import { SidebarGroup, SidebarItem } from './Sidebar'

describe('SettingsSection', () => {
  it('uses the heading level it is given and labels the section with it', async () => {
    const { container, unmount } = await render(
      <>
        <SettingsSection title="Password"><SettingRow label="Last changed" status="3 months ago" /></SettingsSection>
        <SettingsSection title="Passkeys" level={3}><p>…</p></SettingsSection>
      </>,
    )
    const [a, b] = container.querySelectorAll('section')
    expect(a.querySelector('h2')!.textContent).toBe('Password')
    expect(b.querySelector('h3')!.textContent).toBe('Passkeys')
    expect(a.getAttribute('aria-labelledby')).toBe(a.querySelector('h2')!.id)
    await unmount()
  })

  it('ends the line with Learn more, announced with the title, before the first control (settings-copy D3)', async () => {
    const { closeHelp, useHelpRequest } = await import('../../lib/helpRequest')
    function Probe() {
      const r = useHelpRequest()
      return <output data-probe>{r ? `${r.screen}:${r.trigger?.dataset.learnMore !== undefined}` : ''}</output>
    }
    const { container, unmount } = await render(
      <>
        <Probe />
        <SettingsSection title="Webhooks" description="Notify any HTTP endpoint." learnMore="settings/webhooks">
          <SettingRow label="Add a webhook" control={<button type="button">Add webhook</button>} />
        </SettingsSection>
        <SettingsSection title="Password" description="Changing it signs out your other sessions."><p>…</p></SettingsSection>
      </>,
    )
    const [a, b] = container.querySelectorAll('section')
    const line = a.querySelector('[data-settings-line]')!
    const link = line.querySelector<HTMLButtonElement>('button[data-learn-more]')!
    expect(link.textContent).toBe('Learn more')
    expect(link.getAttribute('aria-label')).toBe('Learn more: Webhooks')
    expect(link.dataset.helpScreen).toBe('settings/webhooks')
    expect(line.textContent).toBe('Notify any HTTP endpoint. Learn more')
    // Tab order: the heading is not focusable, so Learn more comes first, then the rows' controls.
    const focusables = [...a.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea')]
    expect(focusables.map((el) => el.textContent)).toEqual(['Learn more', 'Add webhook'])
    expect(a.querySelector('h2')!.querySelector('button')).toBeNull()
    await click(link)
    expect(container.querySelector('[data-probe]')!.textContent).toBe('settings/webhooks:true')
    expect(b.querySelector('[data-learn-more]')).toBeNull()
    await act(async () => closeHelp())
    await unmount()
  })
})

function Harness({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={ref} onClick={() => setOpen(true)}>Delete label</button>
      {open && <ConfirmDialog title="Delete label?" consequence="3 open tasks lose this label." confirmLabel="Delete label" onConfirm={onConfirm} onCancel={() => setOpen(false)} />}
    </>
  )
}

describe('ConfirmDialog', () => {
  it('starts on Cancel, Escape cancels without acting, focus returns to the trigger', async () => {
    const onConfirm = vi.fn()
    const { container, unmount } = await render(<Harness onConfirm={onConfirm} />)
    const trigger = container.querySelector('button')!
    trigger.focus()
    await click(trigger)
    await flush(20)
    const dialog = document.querySelector('[data-testid="confirm-dialog"]')!
    expect(dialog.getAttribute('role')).toBe('alertdialog')
    expect(document.activeElement?.textContent).toBe('Cancel')
    await key(document.activeElement!, 'Escape')
    await flush(20)
    expect(document.querySelector('[data-testid="confirm-dialog"]')).toBeNull()
    expect(onConfirm).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(trigger)
    await unmount()
  })

  it('a tap outside a destructive confirmation neither confirms nor dismisses; confirming runs once', async () => {
    const onConfirm = vi.fn()
    const { container, unmount } = await render(<Harness onConfirm={onConfirm} />)
    await click(container.querySelector('button')!)
    await flush(20)
    const backdrop = document.querySelector('[data-overlay-root]')!
    await click(backdrop)
    expect(document.querySelector('[data-testid="confirm-dialog"]')).not.toBeNull()
    expect(onConfirm).not.toHaveBeenCalled()
    const confirm = [...document.querySelectorAll('[data-testid="confirm-dialog"] button')].find((b) => b.textContent === 'Delete label')!
    await click(confirm)
    await flush(20)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-testid="confirm-dialog"]')).toBeNull()
    await unmount()
  })
})

describe('ListRow', () => {
  it('forwards the view key handlers for Enter and Delete, but not from its menu', async () => {
    const keys: string[] = []
    const { container, unmount } = await render(
      <ListRow label="Passkey: MacBook" meta="Used yesterday" onKeyDown={(e) => keys.push(e.key)} menu={<button>More</button>} />,
    )
    const row = container.querySelector('[tabindex="0"]')!
    await key(row, 'Enter')
    await key(row, 'Delete')
    await key(container.querySelector('button')!, 'Enter')
    expect(keys).toEqual(['Enter', 'Delete'])
    await unmount()
  })
})

describe('SidebarGroup', () => {
  it('shows its count on the heading only while collapsed, and the heading sticks inside the scroller', async () => {
    const { container, rerender, unmount } = await render(
      <SidebarGroup title="Projects" collapsible open count={30}><SidebarItem label="Work" /></SidebarGroup>,
    )
    const heading = () => container.querySelector('[data-sidebar-group-header]')!
    expect(heading().className).toContain('sticky')
    expect(container.querySelector('[data-group-count]')).toBeNull()
    expect(container.querySelector('[data-sidebar-item]')).not.toBeNull()
    await rerender(<SidebarGroup title="Projects" collapsible open={false} count={30}><SidebarItem label="Work" /></SidebarGroup>)
    expect(container.querySelector('[data-group-count]')?.textContent).toBe('30')
    expect(heading().textContent).toContain('Projects')
    expect(container.querySelector('[data-sidebar-item]')).toBeNull()
    expect(container.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded')).toBe('false')
    await unmount()
  })
})

describe('EmptyState (lean-chrome D7, task-list-presentation "Empty views")', () => {
  afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })
  function pointer(kind: 'fine' | 'coarse') {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes(kind), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }))
  }

  it('is one region headed by its sentence, with exactly one button and an optional link', async () => {
    pointer('coarse')
    const onAdd = vi.fn()
    const onLink = vi.fn()
    const { container, unmount } = await render(
      <EmptyState title="Nothing due today." action={{ label: 'Add a task', onClick: onAdd, shortcut: 'q' }} secondary={{ label: 'Open Upcoming', onClick: onLink }} />,
    )
    const region = container.querySelector('section')!
    expect(container.querySelectorAll('section')).toHaveLength(1)
    const heading = region.querySelector('h2')!
    expect(heading.textContent).toBe('Nothing due today.')
    expect(region.getAttribute('aria-labelledby')).toBe(heading.id)
    expect(region.querySelector('svg')).toBeNull()
    expect(region.querySelector('[data-empty-action]')!.textContent).toBe('Add a task')
    expect(region.querySelectorAll('.ui-btn')).toHaveLength(1)
    expect(region.querySelector('kbd')).toBeNull()
    await click(region.querySelector('[data-empty-action]')!)
    await click(region.querySelector('[data-empty-secondary]')!)
    expect(onAdd).toHaveBeenCalledOnce()
    expect(onLink).toHaveBeenCalledOnce()
    await unmount()
  })

  it('shows the key in the tooltip with a fine pointer and never with a coarse one', async () => {
    pointer('fine')
    const fine = await render(<EmptyState title="Nothing due today." action={{ label: 'Add a task', onClick: () => {}, shortcut: 'q' }} />)
    const button = fine.container.querySelector('[data-empty-action]')!
    expect(fine.container.querySelector('kbd')).toBeNull()
    await act(async () => { button.dispatchEvent(new FocusEvent('focusin', { bubbles: true })) })
    expect(document.querySelector('[role="tooltip"]')!.textContent).toBe('Press q')
    await fine.unmount()
    document.body.innerHTML = ''

    pointer('coarse')
    const coarse = await render(<EmptyState title="Nothing due today." action={{ label: 'Add a task', onClick: () => {}, shortcut: 'q' }} />)
    const b2 = coarse.container.querySelector('[data-empty-action]')!
    await act(async () => { b2.dispatchEvent(new FocusEvent('focusin', { bubbles: true })) })
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
    await coarse.unmount()
  })

  it('renders the sentence alone when there is no action', async () => {
    pointer('coarse')
    const { container, unmount } = await render(<EmptyState title="Nothing planned." />)
    expect(container.querySelector('h2')!.textContent).toBe('Nothing planned.')
    expect(container.querySelector('button')).toBeNull()
    await unmount()
  })
})
