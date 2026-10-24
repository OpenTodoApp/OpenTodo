// @vitest-environment happy-dom
// The visual filter builder (OpenSpec change filter-builder): two-way with the
// formula, groups and Not, keyboard removal, and the notice for queries it
// cannot show.
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { parse } from '../../lib/filter'
import { stripPositions, type Leaf } from '../../lib/filter/builder'
import { click, key, render, type, waitFor } from '../../ui/test-utils'
import { conditionText } from './conditionText'
import { draftOf, leafOf } from './ConditionEditor'
import { FilterBuilder } from './FilterBuilder'

afterEach(() => {
  document.body.innerHTML = ''
})

let current = ''
function Harness({ initial, workspaces }: { initial: string; workspaces?: { id: string; name: string }[] }) {
  const [q, setQ] = useState(initial)
  current = q
  return (
    <div>
      <FilterBuilder query={q} onChange={setQ} count={3} labels={[]} projects={[]} fields={[]} workspaces={workspaces} />
      <input aria-label="Filter query" value={q} onChange={(e) => setQ(e.target.value)} />
    </div>
  )
}

const buttons = (root: ParentNode, text: string) =>
  [...root.querySelectorAll('button')].filter((b) => b.textContent?.trim() === text)
const editor = () => document.querySelector('[data-testid="condition-editor"]') as HTMLElement | null

async function setSelect(sel: HTMLSelectElement, value: string) {
  sel.value = value
  sel.dispatchEvent(new Event('change', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 0))
}

/** Adds "Priority is P{n}" to the group whose "+ Condition" button is `add`. */
async function addPriority(add: HTMLButtonElement, n: number) {
  await click(add)
  await waitFor(() => !!editor(), 'the condition dialog')
  await setSelect(editor()!.querySelector('select') as HTMLSelectElement, 'priority')
  await click(buttons(editor()!, `P${n}`)[0])
  await click(buttons(editor()!, 'Add')[0])
  await waitFor(() => !editor(), 'the dialog to close')
}

describe('FilterBuilder', () => {
  it('builds a group of priorities into the formula', async () => {
    const r = await render(<Harness initial="@work & due <= tomorrow" />)
    expect(r.container.textContent).toContain('Label is work')
    expect(r.container.textContent).toContain('Due on or before tomorrow')
    await click(buttons(r.container, 'Group')[0])
    const groups = r.container.querySelectorAll('[data-filter-group][data-depth="2"]')
    expect(groups.length).toBe(1)
    // An empty group changes nothing yet.
    expect(current).toBe('@work & due <= tomorrow')
    const add = () => r.container.querySelector('[data-depth="2"] [data-add-condition]') as HTMLButtonElement
    await addPriority(add(), 1)
    // One condition in a group is just that condition.
    expect(current).toBe('@work & due <= tomorrow & p1')
    await addPriority(add(), 2)
    // A new group starts with the other connective: "Any of these" inside "All of these".
    expect(current).toBe('@work & due <= tomorrow & (p1 | p2)')
    await setSelect(r.container.querySelector('[data-depth="2"] select') as HTMLSelectElement, 'and')
    expect(current).toBe('@work & due <= tomorrow & (p1 & p2)')
    expect(r.container.querySelector('[data-filter-count]')?.textContent).toBe('3 tasks match')
    await r.unmount()
  })

  it('adds a Workspace condition when there is more than one workspace (group-mentions D6)', async () => {
    const one = await render(<Harness initial="" workspaces={[{ id: 'w1', name: 'Personal' }]} />)
    await click(one.container.querySelector('[data-add-condition]') as HTMLButtonElement)
    await waitFor(() => !!editor(), 'the condition dialog')
    expect([...(editor()!.querySelector('select') as HTMLSelectElement).options].map((o) => o.value)).not.toContain('workspace')
    document.body.innerHTML = ''
    const r = await render(<Harness initial="" workspaces={[{ id: 'w1', name: 'Personal' }, { id: 'w2', name: 'Side projects' }]} />)
    await click(r.container.querySelector('[data-add-condition]') as HTMLButtonElement)
    await waitFor(() => !!editor(), 'the condition dialog')
    await setSelect(editor()!.querySelector('select') as HTMLSelectElement, 'workspace')
    await setSelect(editor()!.querySelectorAll('select')[1] as HTMLSelectElement, 'Side projects')
    await click(buttons(editor()!, 'Add')[0])
    await waitFor(() => !editor(), 'the dialog to close')
    expect(current).toBe('workspace: "Side projects"')
    expect(r.container.textContent).toContain('Workspace is Side projects')
  })

  it('follows typing: groups and Not on a condition', async () => {
    const r = await render(<Harness initial="" />)
    expect(r.container.textContent).toContain('No conditions yet')
    const input = r.container.querySelector('input[aria-label="Filter query"]') as HTMLInputElement
    await type(input, '(@errand | @call) & !p4')
    await waitFor(() => r.container.textContent?.includes('Label is errand') ?? false, 'the builder to follow')
    const inner = r.container.querySelector('[data-filter-group="or"]')!
    expect(inner.textContent).toContain('Label is call')
    const not = r.container.querySelector('[data-filter-chip][data-not]')!
    expect(not.textContent).toContain('Priority is P4')
    await r.unmount()
  })

  it('sets Not on a group', async () => {
    const r = await render(<Harness initial="p1 & (@waiting | someday)" />)
    const group = r.container.querySelector('[data-depth="2"]')!
    await click(buttons(group, 'Not')[0])
    expect(current).toBe('p1 & !(@waiting | someday)')
    await r.unmount()
  })

  it('removes the focused chip with Delete and moves focus to the next one', async () => {
    const r = await render(<Harness initial="p1 & p2 & p3" />)
    const chips = () => [...r.container.querySelectorAll<HTMLButtonElement>('button[data-chip-open]')]
    chips()[0].focus()
    await key(chips()[0], 'ArrowRight')
    expect(document.activeElement).toBe(chips()[1])
    await key(chips()[1], 'Delete')
    expect(current).toBe('p1 & p3')
    await waitFor(() => document.activeElement?.textContent?.includes('Priority is P3') ?? false, 'focus on the next chip')
    await r.unmount()
  })

  it('shows a notice instead of rewriting a query it cannot show', async () => {
    const r = await render(<Harness initial="!!p1" />)
    expect(r.container.querySelector('[data-filter-builder="unsupported"]')).not.toBeNull()
    expect(current).toBe('!!p1')
    await r.unmount()
  })

  it('keeps the last builder while the typed query does not parse', async () => {
    const r = await render(<Harness initial="p1" />)
    const input = r.container.querySelector('input[aria-label="Filter query"]') as HTMLInputElement
    await type(input, 'p1 & (')
    expect(r.container.textContent).toContain('Priority is P1')
    expect(current).toBe('p1 & (')
    await r.unmount()
  })
})

describe('condition dialog model', () => {
  const leaf = (q: string) => parse(q) as Leaf

  it('reads back every kind of condition it edits', () => {
    for (const q of ['@work', '#Work', '##Work', 'p2', 'due <= tomorrow', 'deadline < 3 days', 'start = next week', 'created > 2 months ago',
      'completed = last week', 'due before friday', 'due = 2026-11-01', 'overdue', 'no date', 'search: "oat milk"', 'origin: github', 'workspace: "Side projects"',
      'tracked > 1h30', '"cost" > 100', '"client" = "Acme Inc"', '"paid" = true', '"order date" <= 3 days', 'no "cost"']) {
      const back = leafOf(draftOf(leaf(q)))
      expect(back && stripPositions(back), q).toEqual(stripPositions(leaf(q)))
    }
  })

  it('is incomplete without a name, text, valid duration or count', () => {
    expect(leafOf({ ...draftOf(null), kind: 'label', name: ' ' })).toBeNull()
    expect(leafOf({ ...draftOf(null), kind: 'search', text: '' })).toBeNull()
    expect(leafOf({ ...draftOf(null), kind: 'tracked', duration: 'soon' })).toBeNull()
    expect(leafOf({ ...draftOf(null), kind: 'due', when: 'days-ago', n: '' })).toBeNull()
    expect(leafOf({ ...draftOf(null), kind: 'field', name: 'cost', value: '' })).toBeNull()
  })
})

describe('conditionText', () => {
  it('reads one condition of every kind in words', () => {
    const words = (q: string) => conditionText(parse(q) as Leaf)
    expect(words('@errand')).toBe('Label is errand')
    expect(words('##Work')).toBe('Project is Work or a sub-project')
    expect(words('p1')).toBe('Priority is P1')
    expect(words('due <= tomorrow')).toBe('Due on or before tomorrow')
    expect(words('completed = last week')).toBe('Completed last week')
    expect(words('created > 3 days ago')).toBe('Created after 3 days ago')
    expect(words('due < 5 days')).toBe('Due before 5 days from now')
    expect(words('no project')).toBe('No project')
    expect(words('search: "oat milk"')).toBe('Title or notes contain oat milk')
    expect(words('origin: github')).toBe('Origin is github')
    expect(words('workspace: Home')).toBe('Workspace is Home')
    expect(words('tracked > 90')).toBe('Tracked time is more than 1h30')
    expect(words('"cost" >= 100')).toBe('cost is at least 100')
    expect(words('no "cost"')).toBe('cost is empty')
  })
})
