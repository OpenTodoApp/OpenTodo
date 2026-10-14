// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { useDatabase } from '../../lib/db'
import { recordPick } from '../../lib/pickRank'
import { flush, key, render, type } from '../test-utils'
import { ComboboxPanel } from './Combobox'

type Item = { id: string; name: string; email?: string; path?: string[] }
const PEOPLE: Item[] = [
  { id: 'u1', name: 'Ada Lovelace' }, { id: 'u2', name: 'World news' }, { id: 'u3', name: 'Wolfgang' },
  { id: 'u4', name: 'Bob Okafor', email: 'bob@example.com' }, { id: 'u5', name: 'Work' },
]
const base = { getKey: (i: Item) => i.id, getLabel: (i: Item) => i.name, getSecondary: (i: Item) => i.email, label: 'Assign task' }
const input = (c: HTMLElement) => c.querySelector('input[role="combobox"]') as HTMLInputElement
const labels = (c: HTMLElement) => [...c.querySelectorAll('[role="option"]')].map((o) => o.textContent)

describe('ComboboxPanel', () => {
  it('keyboard picking: "wo", Down, Enter picks the second match and closes a single picker', async () => {
    useDatabase(`cb-${Date.now()}-1`)
    const onPick = vi.fn(), onClose = vi.fn()
    const { container, unmount } = await render(<ComboboxPanel {...base} source={PEOPLE} onPick={onPick} onClose={onClose} />)
    await type(input(container), 'wo')
    expect(labels(container)).toEqual(['World news', 'Wolfgang', 'Work']) // all word-prefix matches: source order
    await key(input(container), 'ArrowDown')
    expect(input(container).getAttribute('aria-activedescendant')).toBe(container.querySelectorAll('[role="option"]')[1].id)
    await key(input(container), 'Enter')
    await flush()
    expect(onPick).toHaveBeenCalledWith(PEOPLE[2])
    expect(onClose).toHaveBeenCalled()
    await unmount()
  })

  it('a multiple picker clears the query and stays open', async () => {
    useDatabase(`cb-${Date.now()}-2`)
    const onPick = vi.fn(), onClose = vi.fn()
    const { container, unmount } = await render(<ComboboxPanel {...base} source={PEOPLE} multiple selected={['u4']} onPick={onPick} onClose={onClose} />)
    expect(container.querySelector('[aria-multiselectable="true"]')).not.toBeNull()
    await type(input(container), 'ada')
    await key(input(container), 'Enter')
    await flush()
    expect(onPick).toHaveBeenCalledWith(PEOPLE[0])
    expect(onClose).not.toHaveBeenCalled()
    expect(input(container).value).toBe('')
    await unmount()
  })

  it('announces the number of results after typing pauses', async () => {
    useDatabase(`cb-${Date.now()}-3`)
    const { container, unmount } = await render(<ComboboxPanel {...base} source={PEOPLE} onPick={() => {}} />)
    await type(input(container), 'wo')
    await flush(350)
    expect(container.querySelector('[role="status"]')!.textContent).toBe('3 results available')
    await unmount()
  })

  it('ignores results that arrive for an outdated query', async () => {
    useDatabase(`cb-${Date.now()}-4`)
    const resolvers: Record<string, (v: { items: Item[] }) => void> = {}
    const source = (q: string) => new Promise<{ items: Item[] }>((r) => { resolvers[q] = r })
    const { container, unmount } = await render(<ComboboxPanel {...base} source={source} onPick={() => {}} />)
    await type(input(container), 'ab')
    await flush(150)
    await type(input(container), 'abc')
    await flush(150)
    resolvers.abc({ items: [{ id: 'c', name: 'abc result' }] })
    await flush()
    resolvers.ab?.({ items: [{ id: 'b', name: 'ab result' }] })
    await flush()
    expect(labels(container)).toEqual(['abc result'])
    await unmount()
  })

  it('offers "Create “query”" last when nothing matches exactly, and an empty state without creation', async () => {
    useDatabase(`cb-${Date.now()}-5`)
    const onCreate = vi.fn()
    const r1 = await render(<ComboboxPanel {...base} label="Labels" source={PEOPLE} onPick={() => {}} onCreate={onCreate} />)
    await type(input(r1.container), 'urgent')
    expect(labels(r1.container)).toEqual(['Create “urgent”'])
    await key(input(r1.container), 'Enter')
    await flush()
    expect(onCreate).toHaveBeenCalledWith('urgent')
    await r1.unmount()
    const r2 = await render(<ComboboxPanel {...base} source={PEOPLE} onPick={() => {}} />)
    await type(input(r2.container), 'zzzz')
    expect(r2.container.textContent).toContain('No matches')
    await r2.unmount()
  })

  it('lists recent picks first with an empty query, after pinned options', async () => {
    useDatabase(`cb-${Date.now()}-6`)
    await recordPick('assignee:p1', 'u4')
    const { container, unmount } = await render(
      <ComboboxPanel {...base} source={PEOPLE} pinned={['u5']} rankContext="assignee:p1" onPick={() => {}} />,
    )
    await flush(20)
    expect(labels(container).slice(0, 3)).toEqual(['Work', 'Bob Okaforbob@example.com', 'Ada Lovelace'])
    await unmount()
  })

  it('shows a nested match with its path', async () => {
    useDatabase(`cb-${Date.now()}-7`)
    const tree: Item[] = [{ id: 'w', name: 'Work' }, { id: 'q', name: 'Q3 plan', path: ['Work'] }]
    const { container, unmount } = await render(<ComboboxPanel {...base} label="Project" source={tree} getPath={(i) => i.path ?? []} onPick={() => {}} />)
    await type(input(container), 'q3')
    expect(labels(container)).toEqual(['Q3 planWork'])
    await unmount()
  })

  it('windows large sources: 10,000 options render fewer than 60 rows and keep the active option mounted', async () => {
    useDatabase(`cb-${Date.now()}-8`)
    const many: Item[] = Array.from({ length: 10_000 }, (_, i) => ({ id: `t${i}`, name: `Task ${i}` }))
    const { container, unmount } = await render(<ComboboxPanel {...base} label="Task" source={many} onPick={() => {}} />)
    const rows = () => container.querySelectorAll('[role="option"]')
    expect(rows().length).toBeLessThan(60)
    expect(rows()[0].getAttribute('aria-setsize')).toBe('10000')
    await key(input(container), 'ArrowUp') // wraps to the last option
    const activeId = input(container).getAttribute('aria-activedescendant')!
    const active = document.getElementById(activeId)!
    expect(active.getAttribute('aria-posinset')).toBe('10000')
    expect(rows().length).toBeLessThan(60)
    await unmount()
  })
})
