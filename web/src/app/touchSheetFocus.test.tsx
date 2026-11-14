// @vitest-environment happy-dom
// Sheets and the on-screen keyboard (OpenSpec change touch-sheet-focus): on a device
// without a keyboard a picker opens with its choices in view and its field unfocused,
// focus inside the sheet; a sheet for typing focuses its field everywhere; with a
// keyboard nothing changes.
import 'fake-indexeddb/auto'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { KEYBOARD_ATTR, KEYBOARD_LIKELY } from '../lib/keyboardLikely'
import { createLabel } from '../lib/labels'
import { createTask } from '../lib/ops'
import type { Task } from '../lib/types'
import { Dialog } from '../ui'
import { click, key, render, waitFor } from '../ui/test-utils'
import { LabelPicker } from './LabelPicker'
import { NamePrompt } from './NamePrompt'
import { setupTaskDetailTests } from './task-detail/taskDetail.testkit'
import WhenEditor from './task-detail/WhenEditor'

setupTaskDetailTests()

/** A phone (sheets below 640 px) whose inputs are `touch` only, or which has a mouse. */
function phone(touch: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q === KEYBOARD_LIKELY ? !touch : false, media: q,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false,
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute(KEYBOARD_ATTR)
})

const sheet = () => document.querySelector<HTMLElement>('[data-overlay="sheet"], [data-overlay="dialog"]')
const settled = (what: string) => waitFor(() => !!sheet() && sheet()!.contains(document.activeElement), what)

function When({ task }: { task: Task }) {
  const anchor = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={anchor}>When</button>
      <WhenEditor task={task} readOnly={false} anchor={anchor} segment="due" onSegment={() => {}} onClose={() => {}} onAddLocation={() => {}} />
    </>
  )
}

async function openWhen() {
  const task = (await db.tasks.get(await createTask({ title: 'Plan', due: { date: '2026-10-16' } })))!
  const r = await render(<When task={task} />)
  await waitFor(() => !!document.querySelector('[data-date-words]'), 'the date field')
  await settled('focus inside the When sheet')
  return r
}

async function openLabels() {
  await createLabel({ name: 'errand' })
  const task = await createTask({ title: 'Buy milk' })
  const r = await render(<Dialog title="Labels" onClose={() => {}}><LabelPicker taskId={task} onClose={() => {}} /></Dialog>)
  await waitFor(() => document.querySelectorAll('[role="option"]').length === 1, 'the label list')
  await settled('focus inside the label picker')
  return r
}

describe('a picker on a device without a keyboard', () => {
  it('the When sheet opens with the date field unfocused and focus inside the sheet', async () => {
    phone(true)
    const { unmount } = await openWhen()
    expect(document.activeElement?.tagName).not.toBe('INPUT')
    expect(sheet()!.contains(document.activeElement)).toBe(true)
    await unmount()
  })

  it('the label picker opens with focus on the sheet, and Tab reaches the field first', async () => {
    phone(true)
    const { unmount } = await openLabels()
    expect(document.activeElement).toBe(sheet())
    await key(sheet()!, 'Tab')
    expect(document.activeElement).toBe(document.querySelector('input[role="combobox"]'))
    await unmount()
  })

  it('a tap on the field focuses it', async () => {
    phone(true)
    const { unmount } = await openLabels()
    const field = document.querySelector<HTMLInputElement>('input[role="combobox"]')!
    await click(field)
    field.focus()
    expect(document.activeElement).toBe(field)
    await unmount()
  })

  it('focuses the field again once a hardware key was pressed', async () => {
    phone(true)
    document.documentElement.setAttribute(KEYBOARD_ATTR, '')
    const { unmount } = await openLabels()
    expect(document.activeElement).toBe(document.querySelector('input[role="combobox"]'))
    await unmount()
  })
})

describe('a picker on a device with a keyboard', () => {
  it('the When sheet focuses its date field, as before', async () => {
    phone(false)
    const { unmount } = await openWhen()
    expect(document.activeElement).toBe(document.querySelector('[data-date-words]'))
    await unmount()
  })

  it('the label picker focuses its field, as before', async () => {
    phone(false)
    const { unmount } = await openLabels()
    expect(document.activeElement).toBe(document.querySelector('input[role="combobox"]'))
    await unmount()
  })
})

describe('a sheet for typing', () => {
  for (const touch of [true, false]) {
    it(`focuses its field ${touch ? 'without' : 'with'} a keyboard`, async () => {
      phone(touch)
      const { unmount } = await render(<NamePrompt title="Rename project" label="Name" initial="Home" confirm="Rename" onCancel={() => {}} onSubmit={async () => {}} />)
      await settled('focus inside the prompt')
      expect(document.activeElement).toBe(document.querySelector('input[aria-label="Name"]'))
      await unmount()
    })
  }
})
