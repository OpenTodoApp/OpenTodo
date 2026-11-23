// Projects and sections made on one device reach the other devices (issues
// #1625, #1628: made in the desktop browser, missing on the phone). Against the
// real server, as src/lib/sync.contract.test.ts. Run with `npm run test:contract`.
import { describe, expect, it } from 'vitest'
import { acceptInvitations, account, call, device, switchTo } from '../test/contract'
import { db } from './db'
import { enableEncryption, forgetMemoryKeys, unlock } from './e2ee'
import { mutate } from './ops'
import { syncNow, syncSnapshot } from './sync'
import { projectsIn, readWorkspaceState, switchTo as switchWorkspace } from './workspaces'

const id = () => crypto.randomUUID()

function newProject(name: string, extra: Record<string, unknown> = {}) {
  return { name, color: '#3b82f6', position: 1, archived: false, parent_id: null, created_at: Date.now(), deleted_at: null, ...extra }
}

function newSection(name: string, projectId: string) {
  return { name, project_id: projectId, position: 1, created_at: Date.now(), deleted_at: null }
}

/** The project names this device's sidebar lists in its current workspace. */
async function shownProjects(): Promise<string[]> {
  const [state, projects] = await Promise.all([readWorkspaceState(), db.projects.toArray()])
  return projectsIn(state, projects.filter((p) => !p.deleted_at && !p.archived)).map((p) => p.name)
}

async function synced(): Promise<void> {
  await syncNow()
  expect(syncSnapshot()).toMatchObject({ pending: 0, error: null })
}

describe('projects and sections made on one device', () => {
  // The contract server allows 10 sign-ups a minute for the whole run: the cases share one account where they can.
  let shared: Awaited<ReturnType<typeof account>> | null = null
  const mine = async () => (shared ??= await account('Owner'))

  it('reach the other device of the account, with their sections', async () => {
    const acct = await mine()
    const desktop = await device(acct, 'desktop')
    const phone = await device(acct, 'phone')
    switchTo(phone)
    await synced() // the phone has synced before the desktop writes
    const project = id()
    const section = id()

    switchTo(desktop)
    await mutate('project', project, newProject('From the desktop'))
    await mutate('section', section, newSection('Later', project))
    await synced()

    switchTo(phone)
    await synced()
    expect(await db.projects.get(project)).toMatchObject({ name: 'From the desktop', deleted_at: null })
    expect(await db.sections.get(section)).toMatchObject({ name: 'Later', project_id: project, deleted_at: null })
    expect(await shownProjects()).toContain('From the desktop')

    // A second section in an existing project, and a sub-project, arrive too.
    const second = id()
    const child = id()
    switchTo(desktop)
    await mutate('section', second, newSection('Done', project))
    await mutate('project', child, newProject('Child', { parent_id: project }))
    await synced()
    switchTo(phone)
    await synced()
    expect(await db.sections.get(second)).toMatchObject({ name: 'Done', project_id: project })
    expect(await db.projects.get(child)).toMatchObject({ name: 'Child', parent_id: project })
  })

  it('in a project shared from another account reach that account and its other device', async () => {
    const owner = await mine()
    const editor = await account('Editor')
    const o = await device(owner, 'owner-desktop')
    const project = id()
    await mutate('project', project, newProject('Shared'))
    await synced()
    await call(o.session, 'POST', `/api/v1/projects/${project}/members`, { email: editor.email, role: 'editor' })
    const editorDesktop = await device(editor, 'editor-desktop')
    await acceptInvitations(editorDesktop)
    const editorPhone = await device(editor, 'editor-phone')
    await synced()
    expect((await db.projects.get(project))?.name).toBe('Shared')

    // The editor adds a section from the desktop; the editor's phone and the owner see it.
    const section = id()
    switchTo(editorDesktop)
    await synced()
    await mutate('section', section, newSection('From the editor', project))
    await synced()
    switchTo(editorPhone)
    await synced()
    expect(await db.sections.get(section)).toMatchObject({ name: 'From the editor', project_id: project })
    await device(owner, 'owner-phone')
    await synced()
    expect(await db.sections.get(section)).toMatchObject({ name: 'From the editor', project_id: project })
    expect(await shownProjects()).toContain('Shared')
  })

  it('in another workspace reach the other device, shown once it switches to that workspace', async () => {
    const acct = await mine()
    const desktop = await device(acct, 'desktop')
    const work = await call<{ id: string }>(desktop.session, 'POST', '/api/v1/workspaces', { name: 'Work' })
    await synced()
    await switchWorkspace(work.id)
    const project = id()
    const section = id()
    await mutate('project', project, newProject('Work project', { workspace_id: work.id }))
    await mutate('section', section, newSection('Work section', project))
    await synced()
    expect(await shownProjects()).toEqual(['Work project'])

    await device(acct, 'phone')
    await synced()
    expect(await db.projects.get(project)).toMatchObject({ name: 'Work project', workspace_id: work.id })
    expect(await db.sections.get(section)).toMatchObject({ name: 'Work section', project_id: project })
    // Each device keeps its own current workspace: the phone is in the default one.
    expect(await shownProjects()).not.toContain('Work project')
    await switchWorkspace(work.id)
    expect(await shownProjects()).toEqual(['Work project'])
  })

  it('on an account with end-to-end encryption reach the other device once it is unlocked', async () => {
    const acct = await account()
    const passphrase = 'correct horse battery staple'
    const phone = await device(acct, 'phone')
    await synced()
    forgetMemoryKeys()
    const desktop = await device(acct, 'desktop')
    await synced()
    await enableEncryption(passphrase, { iterations: 600_000 })
    await synced()
    const project = id()
    const section = id()
    await mutate('project', project, newProject('Secret project'))
    await mutate('section', section, newSection('Secret section', project))
    await synced()
    // What the server holds is not the names.
    const server = JSON.stringify(await call(desktop.session, 'GET', '/api/v1/export'))
    expect(server).not.toContain('Secret project')

    forgetMemoryKeys()
    switchTo(phone)
    await syncNow()
    await unlock(passphrase, 'passphrase')
    await synced()
    expect(await db.projects.get(project)).toMatchObject({ name: 'Secret project', deleted_at: null })
    expect(await db.sections.get(section)).toMatchObject({ name: 'Secret section', project_id: project })
    expect(await shownProjects()).toContain('Secret project')
  })
})
