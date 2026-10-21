// The capture screen's save path and route, without a DOM: the shared payload
// becomes one op set through createTask, exactly like a quick-add task.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { parseShare, proposedDescription, proposedTitle } from '../lib/share'
import { parseRoute, routePath } from './router'
import { ShareCapture, pendingShare, setPendingShare } from './ShareCapture'

let n = 0
beforeEach(() => {
  useDatabase(`share-${Date.now()}-${n++}`)
  resetDeviceId()
  setPendingShare(null)
})

const sample = '?title=Interesting%20article&text=the%20quoted%20paragraph&url=https://example.org/post'

describe('share route', () => {
  it('parses /share and builds it back', () => {
    expect(parseRoute('/share')).toEqual({ view: 'share' })
    expect(parseRoute('/share/')).toEqual({ view: 'share' })
    expect(routePath({ view: 'share' })).toBe('/share')
  })
})

describe('ShareCapture', () => {
  it('prefills the title and description from the pending payload as text', () => {
    setPendingShare(parseShare(sample.replace('paragraph', 'paragraph%3Cb%3E')))
    const html = renderToStaticMarkup(createElement(ShareCapture))
    expect(html).toContain('value="Interesting article"')
    expect(html).toContain('the quoted paragraph&lt;b&gt;')
    expect(html).toContain('https://example.org/post')
    expect(html).not.toContain('<b>')
    expect(html).toContain('aria-label="Project: No project"')
    expect(pendingShare()).not.toBeNull()
  })

  it('saves one task with title, description and project in a single op set', async () => {
    const p = parseShare(sample)
    const projectId = await createProject({ name: 'Reading' })
    const before = await db.outbox.count()
    const id = await createTask({ title: proposedTitle(p), description: proposedDescription(p), project_id: projectId })
    const t = await db.tasks.get(id)
    expect(t?.title).toBe('Interesting article')
    expect(t?.description).toBe('the quoted paragraph\n\nhttps://example.org/post')
    expect(t?.project_id).toBe(projectId)
    const ops = (await db.outbox.toArray()).slice(before)
    expect(new Set(ops.map((o) => o.ts)).size).toBe(1)
    expect(ops.every((o) => o.entityId === id)).toBe(true)
  })

  it('files into the Inbox by default', async () => {
    const id = await createTask({ title: 'Fix', description: 'https://example.org/' })
    expect((await db.tasks.get(id))?.project_id).toBeNull()
  })
})
