// @vitest-environment happy-dom
// Links to other apps never open by native navigation (app-links D3 and D4, the
// security read of #1638): in a read-only note, the Markdown view and the origin
// chip an app link carries no address the browser could follow, and a click, a
// middle click or Enter goes through the first-use confirmation.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { pendingAppLink, setAppLinkSchemes } from '../../lib/appLinks'
import { createNote } from '../../lib/noteOps'
import { activeBody, encodeDoc, newDoc, updateBody, type RNode } from '../../lib/richtext'
import { click, flush, render } from '../../ui/test-utils'
import NotesEditor from '../NotesEditor'
import { MarkdownView } from '../MarkdownView'
import { OriginChip } from '../OriginChip'
import { setupTaskDetailTests, waitFor } from '../task-detail/taskDetail.testkit'

setupTaskDetailTests()
afterEach(() => { setAppLinkSchemes([]); pendingAppLink.set(null); localStorage.clear() })

const url = 'zotero://select/items/ABC'
const paper: RNode = { type: 'paragraph', attrs: {}, runs: [{ text: 'Read ', marks: {} }, { text: 'the paper', marks: { link: { href: url } } }] }
const docOf = (nodes: RNode[]) => {
  const d = newDoc()
  d.transact(() => updateBody(activeBody(d), nodes))
  return encodeDoc(d)
}

const middle = (el: Element) => { const e = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }); el.dispatchEvent(e); return e }
const enter = (el: Element) => { const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }); el.dispatchEvent(e); return e }

/** Every way to activate `el` asks first, and `el` has nothing to navigate to. */
async function asksEveryWay(el: HTMLElement) {
  expect(el.hasAttribute('href')).toBe(false)
  for (const act of [() => click(el), async () => { middle(el); await flush() }, async () => { enter(el); await flush() }]) {
    pendingAppLink.set(null)
    await act()
    expect(pendingAppLink.get()?.url).toBe(url)
  }
}

describe('an app link the viewer allowed', () => {
  it('in a read-only note: no address, and a click, middle click or Enter asks first', async () => {
    setAppLinkSchemes(['zotero'])
    const id = await createNote({ title: 'Reading' })
    const { container, unmount } = await render(<NotesEditor note={{ entity: 'note', id, notes_doc: docOf([paper]) }} readOnly />)
    await waitFor(() => !!container.querySelector('.notes-editor [data-app-link="open"]'), 'the link')
    const a = container.querySelector<HTMLElement>('.notes-editor [data-app-link="open"]')!
    expect(a.textContent).toBe('the paper')
    await asksEveryWay(a)
    await unmount()
  })

  it('in an editable note keeps the link while it is typed around, and Ctrl-click asks first', async () => {
    setAppLinkSchemes(['zotero'])
    const id = await createNote({ title: 'Reading' })
    const { container, unmount } = await render(<NotesEditor note={{ entity: 'note', id, notes_doc: docOf([paper]) }} readOnly={false} />)
    await waitFor(() => !!container.querySelector('.notes-editor [data-app-link]'), 'the link')
    const a = container.querySelector<HTMLElement>('.notes-editor [data-app-link]')!
    expect(a.hasAttribute('href')).toBe(false)
    expect(a.getAttribute('data-app-href')).toBe(url)
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }))
    await flush()
    expect(pendingAppLink.get()?.url).toBe(url)
    await unmount()
  })

  it('in the Markdown view and the origin chip: no address, every activation asks first', async () => {
    setAppLinkSchemes(['zotero'])
    const md = await render(<MarkdownView source={`[the paper](${url})`} />)
    await waitFor(() => !!md.container.querySelector('[data-app-link="open"]'), 'the link')
    await asksEveryWay(md.container.querySelector<HTMLElement>('[data-app-link="open"]')!)
    await md.unmount()
    const chip = await render(<OriginChip origin={{ kind: 'url', url }} />)
    await waitFor(() => !!chip.container.querySelector('[data-app-link="open"]'), 'the chip')
    await asksEveryWay(chip.container.querySelector<HTMLElement>('[data-app-link="open"]')!)
    await chip.unmount()
  })
})
