// @vitest-environment happy-dom
// The panel's own lookups do not depend on the interface language (OpenSpec change
// ui-correctness): Vim `i` finds the title in German, and focus returns to the Add
// control whatever its translated name holds.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { applyCatalog, loadLanguage } from '../../lib/i18n/catalog'
import { createTask } from '../../lib/ops'
import { click, flush, key } from '../../ui/test-utils'
import { focusTitle } from '../vim/VimLayer'
import { open, setupTaskDetailTests, waitFor } from './taskDetail.testkit'

setupTaskDetailTests()
afterEach(() => applyCatalog('en', 'en', {}))

describe('language-independent lookups (UI-5)', () => {
  it('Vim i focuses the title in German', async () => {
    await loadLanguage('de')
    const id = await createTask({ title: 'Bericht' })
    const { unmount } = await open(id)
    focusTitle(id, 0)
    expect((document.activeElement as HTMLInputElement | null)?.value).toBe('Bericht')
    await unmount()
  })

  it('cancelling a revealed property returns focus to Add when its name holds quotes', async () => {
    applyCatalog('de', 'de', { 'Add a property': 'Eine "Eigenschaft" hinzufügen', Estimate: 'Schätzung' })
    const id = await createTask({ title: 'Leer' })
    const { row, unmount, container } = await open(id)
    const addButton = () => container.querySelector('[data-add-property] button[aria-haspopup="menu"][aria-label^="Eine"]') as HTMLButtonElement
    await click(addButton())
    await flush(40)
    await click([...document.querySelectorAll('[role="menu"] [role="menuitem"]')].find((i) => i.textContent?.includes('Schätzung'))!)
    await flush(40)
    expect(row('estimate')).toBeTruthy()
    await key(document.activeElement!, 'Escape')
    await waitFor(() => row('estimate') === null, 'the revealed chip leaving')
    await flush(80)
    expect(document.activeElement).toBe(addButton())
    await unmount()
  })
})
