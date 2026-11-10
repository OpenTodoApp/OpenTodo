// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import { setFavourite } from '../lib/favourites'
import { createLabel, LABEL_PALETTE } from '../lib/labels'
import { createProject, resetDeviceId } from '../lib/ops'
import type { User } from '../lib/types'
import { HUES } from '../ui'
import { click, key, render, type, waitFor } from '../ui/test-utils'
import { Sidebar } from './Sidebar'
import { resetSidebarLayout } from './sidebarLayout'

const user: User = { id: 'me', email: 'ada@example.com', name: 'Ada', role: 'owner', createdAt: 0 }
const blue = HUES.find((h) => h.name === 'blue')!.hex
const item = (id: string) => document.querySelector(`[data-action="${id}"]`)
const icon = () => document.querySelector('[data-icon-option="briefcase"]')
const blueSwatch = () => document.querySelector('[role="group"][aria-label="Colour"] button:has([data-hue="blue"])')
const sidebar = () => render(<Sidebar route={{ view: 'inbox' }} user={user} />)

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  resetSidebarLayout()
})

async function openMenu(root: ParentNode, group: string, name: string) {
  const trigger = () => root.querySelector(`[data-sidebar-group="${group}"] button[aria-label="Menu for project ${name}"]`)
  await waitFor(() => !!trigger(), `the ${group} project menu`)
  await click(trigger()!)
  await waitFor(() => !!item('pin'), 'the open project menu')
}

async function startProject(root: ParentNode) {
  const trigger = () => root.querySelector('button[aria-label="Add or fold projects"]')
  await waitFor(() => !!trigger(), 'the Projects add menu')
  await click(trigger()!)
  const newProject = () => [...document.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent?.trim() === 'New project')
  await waitFor(() => !!newProject(), 'New project action')
  await click(newProject()!)
  const form = () => root.querySelector<HTMLFormElement>('[data-new-project-form]')
  await waitFor(() => !!form(), 'the project form')
  return form()!
}

describe('sidebar project appearance (#1127)', () => {
  it.each(['Projects', 'Favourites'])('renames, icons and recolours an existing project from %s', async (group) => {
    const id = await createProject({ name: 'Work' })
    await setFavourite('project', id, true)
    const { container } = await sidebar()
    await openMenu(container, group, 'Work')
    expect([...document.querySelectorAll('[data-action]')].slice(0, 3).map((el) => el.getAttribute('data-action'))).toEqual(['rename', 'icon', 'colour'])
    await click(item('rename')!)
    const name = () => document.querySelector<HTMLInputElement>(group === 'Projects'
      ? '[data-sidebar-group="Projects"] [data-project-rename]'
      : '[role="dialog"][aria-label="Rename project"] input[aria-label="Project name"]')
    await waitFor(() => !!name(), 'the name field for this group')
    await type(name()!, ' Studio ')
    if (group === 'Projects') {
      expect(document.activeElement).toBe(name())
      expect(document.querySelector('[role="dialog"][aria-label="Rename project"]')).toBeNull()
      await key(name()!, 'Enter')
      await waitFor(() => document.activeElement?.getAttribute('data-project-id') === id, 'focus on the project row')
    } else {
      await act(async () => name()!.form!.requestSubmit())
    }
    await waitFor(async () => (await db.projects.get(id))?.name === 'Studio')

    await openMenu(container, group, 'Studio')
    await click(item('icon')!)
    await waitFor(() => !!icon(), 'the briefcase icon')
    await click(icon()!)
    await waitFor(async () => (await db.projects.get(id))?.icon === 'briefcase')

    await openMenu(container, group, 'Studio')
    await click(item('colour')!)
    await waitFor(() => !!blueSwatch(), 'the colour choices')
    await click(blueSwatch()!)
    await waitFor(async () => (await db.projects.get(id))?.color === blue)
    expect(await db.projects.count()).toBe(1)
  })

  it('cancels an inline draft on Escape and saves a later draft when leaving the field', async () => {
    const id = await createProject({ name: 'Work' })
    const { container } = await sidebar()
    const open = async () => {
      await openMenu(container, 'Projects', (await db.projects.get(id))!.name)
      await click(item('rename')!)
      return container.querySelector<HTMLInputElement>('[data-project-rename]')!
    }
    const cancelled = await open()
    await type(cancelled, 'Discard me')
    await key(cancelled, 'Escape')
    await waitFor(() => document.activeElement?.getAttribute('data-project-id') === id, 'focus after cancellation')
    expect((await db.projects.get(id))?.name).toBe('Work')

    const saved = await open()
    await type(saved, 'Studio')
    await act(async () => saved.blur())
    await waitFor(async () => (await db.projects.get(id))?.name === 'Studio', 'rename on blur')
    const names = (await db.outbox.toArray()).filter((op) => op.entityId === id && op.field === 'name').map((op) => op.value)
    expect(names).toEqual(['Work', 'Studio'])
  })

  it.each(['admin', 'editor', 'viewer'] as const)('uses the project header permissions for a shared %s', async (role) => {
    const id = await createProject({ name: 'Shared' })
    await db.memberships.put({ projectId: id, role, ownerId: 'other', members: [] })
    await setFavourite('project', id, true)
    const { container } = await sidebar()
    for (const group of ['Projects', 'Favourites']) {
      await openMenu(container, group, 'Shared')
      expect(Boolean(item('rename'))).toBe(role === 'admin')
      expect(Boolean(item('icon'))).toBe(role === 'admin')
      expect(Boolean(item('colour'))).toBe(role === 'admin')
      await key(document, 'Escape')
    }
  })
})

describe('sidebar creation appearance (#1127)', () => {
  it('saves both choices together when creating a project and drops cancelled choices', async () => {
    const { container } = await sidebar()
    let form = await startProject(container)
    const choose = async () => {
      const appearance = () => form.querySelector('button[aria-label="Appearance"]')
      await waitFor(() => !!appearance(), 'the appearance button')
      const button = appearance()!
      expect(button.nextElementSibling).toBe(form.querySelector('input[placeholder="Project name"]'))
      await click(button)
      await waitFor(() => !!icon() && !!blueSwatch(), 'the shared project appearance control')
      await click(blueSwatch()!)
      await click(icon()!)
    }
    await choose()
    await click([...form.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!)
    expect(await db.projects.count()).toBe(0)
    form = await startProject(container)
    await choose()
    await type(form.querySelector('input[placeholder="Project name"]')!, 'Studio')
    await act(async () => form.requestSubmit())
    await waitFor(async () => (await db.projects.toArray()).some((p) => p.name === 'Studio' && p.icon === 'briefcase' && p.color === blue))
    const [project] = await db.projects.toArray()
    const fields = (await db.outbox.toArray()).filter((o) => o.entityId === project.id && ['name', 'icon', 'color'].includes(o.field))
    expect(fields).toHaveLength(3)
    expect(new Set(fields.map((o) => o.ts)).size).toBe(1)
  })

  it('supports selecting a label colour first and keeps automatic colours for untouched drafts', async () => {
    await createLabel({ name: 'Existing label', color: blue })
    const { container } = await sidebar()
    const startLabel = async () => {
      const trigger = () => container.querySelector('button[aria-label="New label"]')
      await waitFor(() => !!trigger(), 'the Labels add button')
      await click(trigger()!)
      const field = container.querySelector<HTMLInputElement>('input[aria-label="New label name"]')!
      expect(field).toBeTruthy()
      return field
    }
    const automatic = await startLabel()
    await type(automatic, 'Automatic label')
    await act(async () => automatic.form!.requestSubmit())
    await waitFor(async () => (await db.labels.toArray()).some((l) => l.color === LABEL_PALETTE[0]))

    const field = await startLabel()
    const colourButton = () => container.querySelector('[data-sidebar-group="Labels"] button[aria-label="Colour"]')
    await waitFor(() => !!colourButton(), 'the colour button')
    expect(field.previousElementSibling).toBe(colourButton())
    await click(colourButton()!)
    await waitFor(() => !!blueSwatch(), 'the colour choices')
    await click(blueSwatch()!)
    await type(field, 'Blue label')
    await act(async () => field.form!.requestSubmit())
    await waitFor(async () => (await db.labels.toArray()).some((l) => l.name === 'Blue label' && l.color === blue))

    const cancelled = await startLabel()
    await waitFor(() => !!colourButton(), 'the colour button on the new draft')
    await click(colourButton()!)
    await waitFor(() => !!blueSwatch(), 'the colour choices')
    await click(blueSwatch()!)
    await key(cancelled, 'Escape')
    expect(container.querySelector('input[aria-label="New label name"]')).toBeNull()
    expect(await db.labels.count()).toBe(3)
  })
})
