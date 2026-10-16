// Custom fields in the assistant's change-set review and in history wording
// (OpenSpec custom-fields, design D6 and task 5.6): `fields.<id>` reads as the
// definition's name, falling back to the id.
import 'fake-indexeddb/auto'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { reviewChangeSet } from '../lib/assistant'
import { db, useDatabase } from '../lib/db'
import { rememberFieldNames } from '../lib/fieldNames'
import { createField } from '../lib/fields'
import { fieldLabel, formatValue } from '../lib/history'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { ChangeSetReview } from './assistant/ChangeSetReview'
import { changeLabel } from './task-detail/HistoryTab'

let n = 0
beforeEach(() => {
  useDatabase(`fieldsreview-${Date.now()}-${n++}`)
  resetDeviceId()
})

describe('change-set review', () => {
  it('shows a value change as "Cost → 120" using the local definitions', async () => {
    const pid = await createProject({ name: 'Kitchen' })
    const cost = await createField(pid, { name: 'Cost', type: 'number' })
    const client = await createField(pid, { name: 'Client', type: 'text' })
    const id = await createTask({ title: 'Tiles', project_id: pid })
    const review = await reviewChangeSet([
      { entity: 'task', entityId: id, patch: { [`fields.${cost}`]: 1200, [`fields.${client}`]: null }, base: { [`fields.${cost}`]: null, [`fields.${client}`]: null } },
      { entity: 'task', entityId: 'new', create: true, patch: { title: 'Grout', project_id: pid, [`fields.${cost}`]: 15 } },
    ])
    expect(review.items[0].state).toBe('ok')
    expect(review.items[0].lines).toEqual([`Cost → ${new Intl.NumberFormat().format(1200)}`, 'Client cleared'])
    expect(review.items[1].lines).toContain('Cost → 15')
    const html = renderToStaticMarkup(<ChangeSetReview review={review} result={null} busy={false} onToggle={() => {}} onApply={() => {}} onDiscard={() => {}} onUndo={() => {}} />)
    expect(html).toContain('Cost → ')
    // A value that changed locally since the proposal makes the item stale.
    const { setFieldValue } = await import('../lib/fields')
    await setFieldValue(id, cost, 9)
    const stale = await reviewChangeSet([{ entity: 'task', entityId: id, patch: { [`fields.${cost}`]: 1200 }, base: { [`fields.${cost}`]: null } }])
    expect(stale.items[0].state).toBe('stale')
    expect(await db.tasks.count()).toBe(1)
  })
})

describe('history wording', () => {
  it('names a fields.<id> change after its definition, falling back to the id', () => {
    rememberFieldNames([{ id: 'f-cost', name: 'Cost' }])
    expect(fieldLabel('fields.f-cost')).toBe('Cost')
    expect(changeLabel('fields.f-cost')).toBe('Cost')
    expect(fieldLabel('fields.f-unknown')).toBe('f-unknown')
    expect(formatValue('fields.f-cost', 120)).toBe('120')
    expect(formatValue('fields.f-cost', null)).toBe('—')
  })
})
