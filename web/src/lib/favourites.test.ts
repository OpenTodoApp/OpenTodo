// Favourites preference (OpenSpec change sidebar-favourites, task 1.2; appearance-preferences "Favourites preference").
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { favouritesOf, isFavourite, moveFavourite, parseFavourites, pin, unpin } from './favourites'
import { archiveProject, applyOps, createProject, deleteProject, resetDeviceId } from './ops'
import { createLabel } from './labels'
import { createView } from './views'
import type { Op } from './types'
import { hlcSeed } from './hlc'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})

const prefs = () => db.userPrefs.get('me')
const sources = async () => ({ projects: await db.projects.toArray(), labels: await db.labels.toArray(), views: await db.views.toArray() })
const shown = async () => favouritesOf(await prefs(), await sources()).map((f) => `${f.kind}:${f.item.id}`)
const outbox = async () => (await db.outbox.toArray()).map((o) => `${o.entity}.${o.field}=${JSON.stringify(o.value)}`)
const remote = (field: string, value: unknown, ts: number, entity = 'user_prefs', entityId = 'me'): Op =>
  ({ id: `r-${ts}-${field}`, entity, entityId, field, value, ts, device: '~phone' }) as unknown as Op

describe('favourites', () => {
  it('parses, de-duplicates and keeps unknown kinds', () => {
    expect(parseFavourites('project:a, label:b,project:a,,future:x,bogus')).toEqual(['project:a', 'label:b', 'future:x'])
    expect(parseFavourites(undefined)).toEqual([])
  })

  it('pins a project and a label with one preference op each, never a project or label op (offline)', async () => {
    const p = await createProject({ name: 'Website launch' })
    const l = await createLabel({ name: 'errand' })
    await db.outbox.clear()
    await pin('project', p)
    await pin('label', l)
    await pin('label', l) // already pinned: nothing more
    expect(await outbox()).toEqual([`user_prefs.favourites="project:${p}"`, `user_prefs.favourites="project:${p},label:${l}"`])
    expect(await shown()).toEqual([`project:${p}`, `label:${l}`])
    expect(isFavourite(await prefs(), 'project', p)).toBe(true)
  })

  it('pins and unpins a view in one batch with its pinned flag', async () => {
    const v = await createView({ name: 'Waiting', query: '@waiting', pinned: false })
    await db.outbox.clear()
    await pin('view', v)
    expect((await outbox()).sort()).toEqual([`user_prefs.favourites="view:${v}"`, 'view.pinned=true'])
    await db.outbox.clear()
    await unpin('view', v)
    expect((await outbox()).sort()).toEqual(['user_prefs.favourites=""', 'view.pinned=false'])
    expect(await shown()).toEqual([])
    expect((await db.views.get(v))!.pinned).toBe(false)
  })

  it('a view pinned on an older device is listed after the entries, and a view entry whose flag is off is dropped', async () => {
    const p = await createProject({ name: 'Home' })
    const a = await createView({ name: 'A', query: 'p1', pinned: false })
    const b = await createView({ name: 'B', query: 'p2', pinned: false })
    await pin('project', p)
    await pin('view', a)
    // The older device only flips flags: a off, b on.
    const later = Date.now() + 1000
    await applyOps([remote('pinned', false, later, 'view', a), remote('pinned', true, later, 'view', b)])
    hlcSeed(later) // what a sync does with the clock it saw
    expect(await shown()).toEqual([`project:${p}`, `view:${b}`])
    // Unpinning b on this device clears its flag; the list never named it.
    await unpin('view', b)
    expect(await shown()).toEqual([`project:${p}`])
  })

  it('drops missing, archived and deleted items without writing, and brings a restored one back', async () => {
    const p = await createProject({ name: 'Garden' })
    const q = await createProject({ name: 'Trip' })
    await pin('project', p)
    await pin('project', q)
    await db.outbox.clear()
    await archiveProject(p)
    await deleteProject(q)
    await applyOps([remote('favourites', `project:missing,project:${p},project:${q}`, Date.now() + 5000)])
    await db.outbox.clear()
    expect(await shown()).toEqual([])
    expect(await db.outbox.count()).toBe(0)
    expect((await prefs())!.favourites).toBe(`project:missing,project:${p},project:${q}`)
    await applyOps([remote('archived', false, Date.now() + 6000, 'project', p)])
    expect(await shown()).toEqual([`project:${p}`])
  })

  it('keeps an unknown kind from a newer device when this device writes', async () => {
    const p = await createProject({ name: 'Work' })
    await applyOps([remote('favourites', 'future:x', Date.now() - 60000)])
    await pin('project', p)
    expect((await prefs())!.favourites).toBe(`future:x,project:${p}`)
    expect(await shown()).toEqual([`project:${p}`])
  })

  it('moves within the group, keeping unresolved entries in their slots and writing a flag-only view into the list', async () => {
    const p = await createProject({ name: 'Website launch' })
    const l = await createLabel({ name: 'errand' })
    const v = await createView({ name: 'Deep work', query: 'p1' })
    await applyOps([remote('favourites', `project:${p},future:x,label:${l}`, Date.now() - 60000)])
    expect(await shown()).toEqual([`project:${p}`, `label:${l}`, `view:${v}`])
    await db.outbox.clear()
    await moveFavourite('view', v, -1)
    await moveFavourite('view', v, -1)
    expect(await shown()).toEqual([`view:${v}`, `project:${p}`, `label:${l}`])
    expect((await prefs())!.favourites).toBe(`view:${v},future:x,project:${p},label:${l}`)
    await moveFavourite('view', v, -1) // already first
    expect(await shown()).toEqual([`view:${v}`, `project:${p}`, `label:${l}`])
    // Its position among the saved filters is not touched.
    expect((await db.outbox.toArray()).some((o) => o.entity === 'view' && o.field === 'position')).toBe(false)
  })

  it('concurrent pins converge: the later list wins and nothing is duplicated', async () => {
    const a = await createProject({ name: 'A' })
    const b = await createProject({ name: 'B' })
    await pin('project', a)
    const local = (await prefs())!._clock.favourites.ts
    await applyOps([remote('favourites', `project:${b},project:${b}`, local + 1000)])
    expect(await shown()).toEqual([`project:${b}`])
    // An older write from another device does not win.
    await applyOps([remote('favourites', `project:${a}`, local - 1000)])
    expect(await shown()).toEqual([`project:${b}`])
  })

  it('a merged label leaves the group and the survivor is not pinned', async () => {
    const { mergeLabels } = await import('./labels')
    const src = await createLabel({ name: 'errands' })
    const dst = await createLabel({ name: 'errand' })
    await pin('label', src)
    await mergeLabels(src, dst)
    expect(await shown()).toEqual([])
    expect(isFavourite(await prefs(), 'label', dst)).toBe(false)
  })
})
