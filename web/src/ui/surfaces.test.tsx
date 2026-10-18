// @vitest-environment happy-dom
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Avatar, avatarHue, initials } from './Avatar'
import { Badge } from './Card'
import { Tabs } from './Tabs'
import { key, render } from './test-utils'

describe('Avatar', () => {
  it('derives the same hue and initials from the same account on every render', () => {
    expect(avatarHue('u-123')).toBe(avatarHue('u-123'))
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(avatarHue)).size).toBeGreaterThan(3)
    expect(initials('Sam Rivera')).toBe('SR')
    expect(initials('bob@example.com')).toBe('BE')
  })

  it('is decorative next to a visible name, an image with the name otherwise', async () => {
    const { container, unmount } = await render(<><Avatar id="u1" name="Sam Rivera" /><Avatar id="u1" name="Sam Rivera" decorative={false} /></>)
    const [a, b] = container.querySelectorAll('span[data-hue]')
    expect(a.getAttribute('aria-hidden')).toBe('true')
    expect(b.getAttribute('aria-label')).toBe('Sam Rivera')
    expect(a.getAttribute('data-hue')).toBe(b.getAttribute('data-hue'))
    await unmount()
  })
})

describe('Badge', () => {
  it('maps a stored colour to its palette hue', async () => {
    const { container, unmount } = await render(<Badge color="#22c55e">errands</Badge>)
    expect(container.querySelector('[data-hue]')!.getAttribute('data-hue')).toBe('green')
    await unmount()
  })
})

describe('Tabs', () => {
  it('draws each group name before its first tab and reads it with every tab of the group', async () => {
    const { container, unmount } = await render(
      <Tabs label="Review steps" value="b" onChange={() => {}} tabs={[{ id: 'a', label: 'Inbox', group: 'Get clear' }, { id: 'b', label: 'Mind sweep', group: 'Get clear' }, { id: 'c', label: 'Look back', group: 'Get current' }]}>
        <p>panel</p>
      </Tabs>,
    )
    expect([...container.querySelectorAll('[data-tab-group]')].map((g) => g.textContent)).toEqual(['Get clear', 'Get current'])
    expect([...container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)).toEqual(['Get clear: Inbox', 'Get clear: Mind sweep', 'Get current: Look back'])
    expect(container.querySelector('[role="tablist"]')!.className).toContain('overflow-x-auto')
    await unmount()
  })

  function Demo() {
    const [v, setV] = useState('comments')
    return (
      <Tabs label="Task sections" value={v} onChange={setV} tabs={[{ id: 'comments', label: 'Comments' }, { id: 'activity', label: 'Activity' }, { id: 'history', label: 'History' }]}>
        <p>panel {v}</p>
      </Tabs>
    )
  }
  const selected = (c: HTMLElement) => c.querySelector('[aria-selected="true"]')!.textContent

  it('moves focus and selection with Right, Left, Home and End', async () => {
    const { container, unmount } = await render(<Demo />)
    const list = container.querySelector('[role="tablist"]')!
    await key(list, 'ArrowRight')
    expect(selected(container)).toBe('Activity')
    expect(document.activeElement?.textContent).toBe('Activity')
    expect(container.textContent).toContain('panel activity')
    await key(list, 'End')
    expect(selected(container)).toBe('History')
    await key(list, 'ArrowRight')
    expect(selected(container)).toBe('Comments')
    await key(list, 'ArrowLeft')
    expect(selected(container)).toBe('History')
    await key(list, 'Home')
    expect(selected(container)).toBe('Comments')
    expect([...container.querySelectorAll('[role="tab"]')].map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])
    await unmount()
  })
})
