// @vitest-environment happy-dom
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { click, flush, key, render } from '../test-utils'
import { ConfirmDialog } from './ConfirmDialog'
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
