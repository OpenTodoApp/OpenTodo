// @vitest-environment happy-dom
// Spec "Vault sync in the Obsidian plugin" through the loaded plugin: the
// settings tab (obsidian-vault-sync task 4.1), the command and Send line on a
// line of the synced folder (task 4.3).
import { beforeEach, describe, expect, it } from 'vitest'
import { connected, memoryEditor, until } from './harness'
import { notices } from './obsidian'

type Tab = { containerEl: HTMLElement; display(): void }

function tabOf(h: Awaited<ReturnType<typeof connected>>): Tab {
  const tab = (h.plugin as unknown as { tabs: Tab[] }).tabs[0]
  document.body.append(tab.containerEl)
  tab.display()
  return tab
}

const button = (el: HTMLElement, text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement | undefined

async function seeded() {
  const h = await connected()
  h.server.put('project', 'p-home', { name: 'Home', archived: false, deleted_at: null, position: 1000 }, 1)
  h.server.put('task', 't-1', { title: 'Water the plants', project_id: 'p-home', deleted_at: null, completed_at: null, position: 1000 }, 1)
  return h
}

beforeEach(() => document.body.replaceChildren())

describe('the vault in the plugin', () => {
  it('the settings tab turns sync on, says when it syncs and shows who syncs the folder', async () => {
    const h = await seeded()
    const tab = tabOf(h)
    const el = tab.containerEl
    expect(el.textContent).toContain('Sync a folder with OpenTodo')
    expect(el.textContent).toContain('It does not sync in the background or while Obsidian is closed.')
    const select = [...el.querySelectorAll('select')].at(-1) as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).toContain('OpenTodo')
    button(el, 'Turn on')!.click()
    await until(() => h.plugin.vault.status.kind === 'synced')
    tab.display()
    expect(el.textContent).toMatch(/Synced by this device \(Obsidian\) at/)
    expect(h.app.files.get('OpenTodo/Home.md')).toContain('- [ ] Water the plants 🆔 t-1')

    // Another device takes the folder over (its state replicated here).
    const st = JSON.parse(h.app.files.get('OpenTodo/.opentodo/state.json')!)
    st.owner = { kind: 'cli', install: 'laptop-1', label: 'laptop' }
    st.lease_until = Date.now() + 120_000
    h.app.files.set('OpenTodo/.opentodo/state.json', JSON.stringify(st))
    await h.plugin.vault.run('interval')
    tab.display()
    expect(el.textContent).toContain('Synced by laptop, whose lease runs until')
    button(el, 'Take over syncing here')!.click()
    await until(() => document.querySelector('.opentodo-confirm') !== null)
    const modal = document.querySelector('.opentodo-confirm') as HTMLElement
    expect(modal.textContent).toContain('nothing is created twice')
    button(modal, 'Take over syncing here')!.click()
    await until(() => h.plugin.vault.status.kind === 'synced')
    expect(JSON.parse(h.app.files.get('OpenTodo/.opentodo/state.json')!).owner.install).toBe(h.plugin.owner().install)

    // Turning off gives the folder up and keeps the files.
    tab.display()
    button(el, 'Turn off')!.click()
    await until(() => h.plugin.vault.folder() === null)
    expect(h.app.files.has('OpenTodo/Home.md')).toBe(true)
  })

  it('an encrypted account is told once, when turning on, that the folder holds plaintext', async () => {
    const h = await connected({ encrypted: true })
    const tab = tabOf(h)
    button(tab.containerEl, 'Turn on')!.click()
    await until(() => document.querySelector('.opentodo-confirm') !== null)
    const modal = document.querySelector('.opentodo-confirm') as HTMLElement
    expect(modal.textContent).toContain('plain text')
    button(modal, 'Cancel')!.click()
    expect(h.plugin.vault.folder()).toBeNull()
  })

  it('Send line refuses a line of the synced folder; the command syncs and says so', async () => {
    const h = await seeded()
    await h.plugin.vault.enable('OpenTodo')
    notices.length = 0
    const n = h.server.pushes.length
    const cmd = (h.plugin as unknown as { commands: { id: string; editorCallback?: (e: unknown, v: unknown) => unknown; callback?: () => unknown }[] }).commands
    const send = cmd.find((c) => c.id === 'send-line')!
    const { TFile } = await import('./obsidian')
    await send.editorCallback!(Object.assign(memoryEditor('- [ ] Water the plants 🆔 t-1'), { getCursor: () => ({ line: 0, ch: 0 }) }), { file: new TFile('OpenTodo/Home.md') })
    await until(() => notices.length > 0)
    expect(notices[0].message).toBe('This line is already synced by the vault.')
    expect(h.server.pushes.length).toBe(n)
    await cmd.find((c) => c.id === 'sync-vault')!.callback!()
    await until(() => notices.length > 1)
    expect(notices[1].message).toBe('The vault is up to date.')
  })
})
