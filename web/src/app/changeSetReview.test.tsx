import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Review } from '../lib/assistant'
import { appliedSummary, ChangeSetReview } from './assistant/ChangeSetReview'

const noop = () => {}
const review: Review = {
  dropped: ['“Old task” is no longer on this device, so its change was left out.'],
  items: [
    { change: { entity: 'task', entityId: 'a', patch: {} }, state: 'ok', checked: true, title: 'Water plants', lines: ['Due Wed 14 Oct → Fri 16 Oct'], shared: false },
    { change: { entity: 'task', entityId: 'b', patch: {} }, state: 'ok', checked: true, title: 'Paint the fence', lines: ['Completed'], shared: true },
    { change: { entity: 'task', entityId: 'c', patch: {} }, state: 'stale', checked: false, title: 'Call Ann', lines: ['Priority P4 → P1'], shared: false },
  ],
}

const render = (over: Partial<Parameters<typeof ChangeSetReview>[0]> = {}) =>
  renderToStaticMarkup(<ChangeSetReview review={review} result={null} busy={false} onToggle={noop} onApply={noop} onDiscard={noop} onUndo={noop} {...over} />)

describe('ChangeSetReview', () => {
  it('lists each change in words with a checkbox, badges shared and stale items', () => {
    const html = render()
    // The card's head (assistant-surface D4): what it is, how many are selected, that nothing changes yet.
    expect(html).toContain('>Proposed changes<')
    expect(html).toContain('2 of 3 selected')
    expect(html).toContain('Nothing changes until you apply')
    expect(html).toContain('Due Wed 14 Oct → Fri 16 Oct')
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(3)
    expect((html.match(/checked=""/g) ?? []).length).toBe(2)
    expect(html).toContain('>shared<')
    expect(html).toContain('changed since proposed')
    expect(html).toContain('aria-label="Paint the fence: Completed (shared project)"')
    expect(html).toContain('no longer on this device')
    expect(html).toContain('Apply 2 changes')
    expect(render({ review: { ...review, items: review.items.slice(0, 1) } })).toContain('Apply 1 change<')
    expect(html).toContain('>Discard<')
    expect(html).toContain('role="group"')
  })

  it('summarises what was applied and offers Undo', () => {
    expect(appliedSummary({ applied: 4, total: 5, undoId: 'u' })).toBe('4 of 5 changes applied.')
    expect(appliedSummary({ applied: 2, total: 2, undoId: 'u', auto: true })).toBe('2 changes applied automatically.')
    expect(appliedSummary({ applied: 0, total: 3, undoId: null, discarded: true })).toContain('Nothing was changed')
    expect(appliedSummary({ applied: 12, total: 12, undoId: 'u', undone: { restored: 11, skipped: ['Call Ann'] } })).toContain('Call Ann')
    const html = render({ result: { applied: 4, total: 5, undoId: 'u' } })
    expect(html).toContain('4 of 5 changes applied.')
    expect(html).toContain('>Undo<')
    expect(render({ result: { applied: 4, total: 5, undoId: 'u', undone: { restored: 4, skipped: [] } } })).not.toContain('>Undo<')
  })
})
