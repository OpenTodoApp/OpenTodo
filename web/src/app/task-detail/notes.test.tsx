// @vitest-environment happy-dom
// Notes in the task panel (OpenSpec change ux-overhaul, web-app "Task panel
// layout"): a single placeholder line until focused, an editor while focused,
// quiet text when filled.
import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { createTask } from '../../lib/ops'
import { click, flush, key, type } from '../../ui/test-utils'
import { db } from '../../lib/db'
import { open, setupTaskDetailTests, waitFor } from './taskDetail.testkit'

setupTaskDetailTests()

const editor = (root: ParentNode) => root.querySelector<HTMLElement>('.notes-editor[contenteditable]')

describe('notes', () => {
  it('an empty note is one placeholder line that becomes the editor on focus and goes quiet again on blur', async () => {
    const id = await createTask({ title: 'Plan' })
    const { container, unmount } = await open(id)
    await waitFor(() => !!editor(container))
    const host = container.querySelector('.notes-host')!
    const ed = editor(container)!
    expect(ed.classList.contains('is-empty')).toBe(true)
    expect(ed.getAttribute('data-placeholder')).toBe('Add notes…')
    expect(host.hasAttribute('data-notes-editing')).toBe(false)
    ed.focus()
    await flush(20)
    expect(host.hasAttribute('data-notes-editing')).toBe(true)
    ed.blur()
    await flush(20)
    expect(host.hasAttribute('data-notes-editing')).toBe(false)
    await unmount()
  })

  it('a filled note reads as text with no placeholder, and a viewer gets no editor chrome', async () => {
    const id = await createTask({ title: 'Plan', description: 'Bring the ladder.' })
    const a = await open(id)
    // The plain description folds into the document when the note is first opened.
    await waitFor(() => !!editor(a.container) && !editor(a.container)!.classList.contains('is-empty'))
    expect(a.container.querySelector('.notes-host')!.hasAttribute('data-notes-editing')).toBe(false)
    expect(editor(a.container)!.textContent).toContain('Bring the ladder.')
    await a.unmount()

    const b = await open(id, { readOnly: true })
    await waitFor(() => !!b.container.querySelector('.notes-editor'))
    expect(b.container.querySelector('.notes-editor')!.getAttribute('contenteditable')).toBe('false')
    expect(b.container.querySelector('.notes-editor')!.getAttribute('data-placeholder')).toBeNull()
    await b.unmount()
  })

  it('Ctrl+K asks for the address in the app dialog and accepts only addresses a note can link (ui-correctness)', async () => {
    const asked = vi.fn(() => 'javascript:alert(1)')
    vi.stubGlobal('prompt', asked)
    const id = await createTask({ title: 'Plan', description: 'Read the guide' })
    const { container, unmount } = await open(id)
    await waitFor(() => !!editor(container) && !editor(container)!.classList.contains('is-empty'))
    const ed = editor(container)!
    ed.focus()
    await key(ed, 'a', { ctrlKey: true })
    await key(ed, 'k', { ctrlKey: true })
    await flush(20)
    expect(asked).not.toHaveBeenCalled()
    const dialog = () => document.querySelector<HTMLElement>('[data-testid="link-dialog"]')
    expect(dialog()).toBeTruthy()
    const input = dialog()!.querySelector('input')!
    await type(input, 'javascript:alert(1)')
    await click([...dialog()!.querySelectorAll('button')].find((b) => b.textContent === 'Save')!)
    expect(dialog()!.textContent).toContain('starts with https://')
    await type(input, 'https://example.com/guide')
    await click([...dialog()!.querySelectorAll('button')].find((b) => b.textContent === 'Save')!)
    await flush(20)
    expect(dialog()).toBeNull()
    expect(ed.querySelector('a')?.getAttribute('href')).toBe('https://example.com/guide')
    await waitFor(async () => ((await db.tasks.get(id))?.description ?? '').includes('(https://example.com/guide)'), 'the saved link', 5000)
    vi.unstubAllGlobals()
    await unmount()
  })
})
