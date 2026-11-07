// @vitest-environment happy-dom
// "New project" from the Projects group's + menu (issue #997): the inline form sits
// under the last project, so with a long list it opens below the fold. Choosing the
// item brings the form into view and puts focus in its name field, on a phone too,
// where the menu is a bottom sheet over an inert app and the field's own autofocus
// cannot take focus.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, resetDeviceId } from '../lib/ops'
import type { User } from '../lib/types'
import { click, render, waitFor } from '../ui/test-utils'
import { resetPanel } from './panel'
import { Sidebar } from './Sidebar'
import { resetSidebarLayout } from './sidebarLayout'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User

const realMatchMedia = window.matchMedia
// Below 640 px nothing matches: a popover is a bottom sheet.
function phone() {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia
}

// happy-dom does not keep focus out of an inert subtree; a browser does.
const realFocus = HTMLElement.prototype.focus
function honourInert() {
  vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, opts?: FocusOptions) {
    for (let el: HTMLElement | null = this; el; el = el.parentElement) if (el.inert) return
    realFocus.call(this, opts)
  })
}

let scrolled: Element[] = []
beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  resetSidebarLayout()
  resetPanel()
  scrolled = []
  Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this) }
})
afterEach(() => { window.matchMedia = realMatchMedia; vi.restoreAllMocks(); resetSidebarLayout() })

const scrolledForm = () => scrolled.some((el) => el.matches('form[data-new-project-form]'))
const menuItem = (label: string) => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) => el.textContent?.includes(label))

async function openNewProject(container: HTMLElement) {
  for (let i = 0; i < 40; i++) await createProject({ name: `Project ${i}` })
  await waitFor(() => container.textContent!.includes('Project 39'), 'the projects')
  await click(container.querySelector('[data-sidebar-group="Projects"] button[aria-label="Add or fold projects"]')!)
  await waitFor(() => !!menuItem('New project'), 'the + menu')
  await click(menuItem('New project')!)
  const field = () => container.querySelector<HTMLInputElement>('input[placeholder="Project name"]')
  await waitFor(() => !!field() && document.activeElement === field(), 'focus in the name field')
  return field()!
}

describe('New project from the + menu (issue #997)', () => {
  it('on a phone the sheet closes, the name field takes focus and the form is scrolled into view', async () => {
    phone()
    honourInert()
    const r = await render(<aside data-sidebar><Sidebar route={{ view: 'inbox' }} user={user} /></aside>)
    // The app root is what a bottom sheet makes inert.
    r.container.id = 'root'
    const field = await openNewProject(r.container)
    expect(document.querySelector('[data-overlay="sheet"]')).toBeNull()
    expect(r.container.inert).toBe(false)
    const form = field.closest('form')!
    expect(scrolledForm()).toBe(true)
    expect(r.container.querySelector('[data-sidebar-scroll]')!.contains(form)).toBe(true)
    await r.unmount()
  })

  it('on a desktop the menu is a popover and the form comes into view the same way', async () => {
    const r = await render(<aside data-sidebar><Sidebar route={{ view: 'inbox' }} user={user} /></aside>)
    const field = await openNewProject(r.container)
    expect(field.closest('form')?.hasAttribute('data-new-project-form')).toBe(true)
    expect(scrolledForm()).toBe(true)
    await r.unmount()
  })
})
