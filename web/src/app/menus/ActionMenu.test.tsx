// @vitest-environment happy-dom
// Action menus as data (OpenSpec change labels-and-menus, tasks 1.2–1.4).
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { click, flush, key, render } from '../../ui/test-utils'
import { ActionMenu, orderGroups, useConfirm, type ActionGroup } from './ActionMenu'

afterEach(() => { document.body.innerHTML = '' })

const targets = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }, { id: 'c', name: 'Current' }]

function groups(calls: string[]): ActionGroup[] {
  return [
    { items: [{ kind: 'confirm', id: 'delete', label: 'Delete thing', icon: 'trash-2', tone: 'danger',
      confirm: { title: 'Delete thing?', body: () => '3 open tasks are affected.', confirmLabel: 'Delete thing', onConfirm: () => { calls.push('deleted') } } }] },
    { items: [
      { kind: 'action', id: 'rename', label: 'Rename', icon: 'pencil', shortcut: 'F2', onSelect: () => { calls.push('rename') } },
      { kind: 'action', id: 'up', label: 'Move up', icon: 'arrow-up', disabled: true, reason: 'Already first', onSelect: () => { calls.push('up') } },
    ] },
    { items: [
      { kind: 'check', id: 'pin', label: 'Pinned to sidebar', checked: true, onSelect: () => { calls.push('pin') } },
      { kind: 'picker', id: 'move', label: 'Move to', icon: 'folder-input', picker: {
        title: 'Move to', source: targets.filter((t) => t.id !== 'c'), getKey: (t) => t.id, getLabel: (t) => t.name,
        onPick: (t) => { calls.push(`move:${t.id}`) },
      } },
    ] },
  ]
}

async function openMenu(calls: string[]) {
  const r = await render(<ActionMenu label="Menu for thing" groups={groups(calls)} />)
  const trigger = r.container.querySelector('button')!
  trigger.focus()
  await click(trigger)
  await flush(20)
  return { ...r, trigger }
}

const items = () => [...document.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')] as HTMLElement[]

describe('orderGroups', () => {
  it('moves danger items after every other group and drops empty groups', () => {
    const out = orderGroups(groups([]))
    expect(out.map((g) => g.items.map((i) => i.id))).toEqual([['rename', 'up'], ['pin', 'move'], ['delete']])
  })
})

describe('ActionMenu', () => {
  it('renders groups in order with separators, danger last, reasons and checked state', async () => {
    const calls: string[] = []
    const { unmount } = await openMenu(calls)
    expect(items().map((b) => b.getAttribute('data-menu-label'))).toEqual(['Rename', 'Move up', 'Pinned to sidebar', 'Move to…', 'Delete thing…'])
    expect(document.querySelectorAll('[role="separator"]').length).toBe(2)
    const up = items()[1]
    expect(up.hasAttribute('disabled')).toBe(true)
    const desc = document.getElementById(up.getAttribute('aria-describedby')!.split(' ').find((id) => id.endsWith('-d'))!)
    expect(desc?.textContent).toBe('Already first')
    expect(items()[2].getAttribute('aria-checked')).toBe('true')
    expect(items()[4].className).toContain('text-danger')
    await unmount()
  })

  it('a picker step lists only valid targets; the first Escape goes back, the second closes', async () => {
    const calls: string[] = []
    const { unmount } = await openMenu(calls)
    await click(items()[3])
    await flush(20)
    expect(document.querySelector('[data-picker-step]')).toBeTruthy()
    const options = [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent)
    expect(options.join(' ')).toContain('Alpha')
    expect(options.join(' ')).not.toContain('Current')
    await key(document, 'Escape')
    await flush(20)
    expect(document.querySelector('[data-picker-step]')).toBeNull()
    expect(items().length).toBe(5)
    await key(document, 'Escape')
    await flush(20)
    expect(document.querySelector('[role="menu"]')).toBeNull()
    expect(calls).toEqual([])
    await unmount()
  })

  it('picking a target applies it and closes the menu', async () => {
    const calls: string[] = []
    const { unmount } = await openMenu(calls)
    await click(items()[3])
    await flush(20)
    const beta = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes('Beta')) as HTMLElement
    await act(async () => { beta.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); beta.click() })
    await flush(20)
    expect(calls).toEqual(['move:b'])
    expect(document.querySelector('[data-picker-step]')).toBeNull()
    await unmount()
  })

  it('a confirm item closes the menu and opens an alert dialog focused on Cancel; Cancel has no side effect', async () => {
    const calls: string[] = []
    const { unmount } = await openMenu(calls)
    await click(items()[4])
    await flush(30)
    expect(document.querySelector('[role="menu"]')).toBeNull()
    const dialog = document.querySelector('[role="alertdialog"]')!
    expect(dialog.textContent).toContain('3 open tasks are affected.')
    expect(document.activeElement?.textContent).toBe('Cancel')
    const confirm = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Delete thing')
    expect(confirm).toBeTruthy()
    await click(document.activeElement!)
    await flush(20)
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    expect(calls).toEqual([])
    await unmount()
  })

  it('confirming runs the action', async () => {
    const calls: string[] = []
    const { unmount } = await openMenu(calls)
    await click(items()[4])
    await flush(30)
    const confirm = [...document.querySelectorAll('[role="alertdialog"] button')].find((b) => b.textContent === 'Delete thing')!
    await click(confirm)
    await flush(20)
    expect(calls).toEqual(['deleted'])
    await unmount()
  })
})

describe('useConfirm', () => {
  it('Escape resolves without running the action', async () => {
    const calls: string[] = []
    function Host() {
      const c = useConfirm()
      return <><button onClick={() => c.ask({ title: 'Merge?', body: 'Two labels become one.', confirmLabel: 'Merge', onConfirm: () => { calls.push('merged') } })}>ask</button>{c.element}</>
    }
    const r = await render(<Host />)
    await click(r.container.querySelector('button')!)
    await flush(20)
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain('Two labels become one.')
    await key(document, 'Escape')
    await flush(20)
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    expect(calls).toEqual([])
    await r.unmount()
  })
})
