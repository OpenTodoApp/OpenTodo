// The "Sync a folder with OpenTodo" part of the settings tab
// (obsidian-vault-sync task 4.1): the folder, the adopt and plaintext
// confirmations, the status (who syncs the folder and until when), "Take over
// syncing here", "Sync now" and "Turn off".
import { Setting, type App } from 'obsidian'
import { confirm } from './confirm'
import type OpenTodoPlugin from './main'
import { currentLanguage, tr } from './strings'
import { DEFAULT_FOLDER, NeedsAdoptError, type VaultStatus } from './vaultSync'

const time = (ms: number) => new Date(ms).toLocaleTimeString(currentLanguage(), { hour: '2-digit', minute: '2-digit' })

/** The status line of the vault sync. */
export function vaultStatusText(s: VaultStatus, self: string): string {
  switch (s.kind) {
    case 'off': return ''
    case 'waiting': return tr('Not synced yet.')
    case 'syncing': return tr('Syncing…')
    case 'synced': {
      const parts = [tr('Synced by this device ({label}) at {time}.', { label: self, time: time(s.at) })]
      if (s.report.conflicts > 0) parts.push(tr('{n, plural, one {# conflict} other {# conflicts}}: the file’s lines are in the .conflict.md files.', { n: s.report.conflicts }))
      if (s.report.warnings.length > 0) parts.push(tr('{n, plural, one {# line was} other {# lines were}} not fully read: {first}', { n: s.report.warnings.length, first: s.report.warnings[0] }))
      return parts.join(' ')
    }
    case 'disconnected': return tr('Connect OpenTodo first.')
    case 'locked': return tr('Unlock OpenTodo to sync the vault.')
    case 'owned':
      return s.running
        ? tr('Synced by {label}, whose lease runs until {time}. This device does not sync the folder.', { label: s.owner.label, time: time(s.leaseUntil) })
        : tr('Synced by {label}, last renewed until {time}. This device does not sync the folder unless you take over.', { label: s.owner.label, time: time(s.leaseUntil) })
    case 'tasknotes': return tr('This folder has a TaskNotes folder linked; keep syncing it with ot vault.')
    case 'failed': return tr('The last sync failed: {reason} Next try at {time}.', { reason: s.message, time: time(s.retryAt) })
  }
}

/** The folders a user can pick: every visible folder, and the default one when it does not exist yet. */
export function folderChoices(app: App): { path: string; label: string }[] {
  const vault = app.vault as unknown as { getAllFolders?: (root?: boolean) => { path: string }[] }
  const paths = (vault.getAllFolders?.(false) ?? []).map((f) => f.path).filter((p) => p !== '/' && p !== '' && !p.split('/').some((x) => x.startsWith('.'))).sort()
  const out = paths.map((p) => ({ path: p, label: p }))
  if (!paths.includes(DEFAULT_FOLDER)) out.unshift({ path: DEFAULT_FOLDER, label: tr('{folder} (a new folder)', { folder: DEFAULT_FOLDER }) })
  return out
}

export class VaultSection {
  choice = DEFAULT_FOLDER
  message = ''
  busy = false

  constructor(private app: App, private plugin: OpenTodoPlugin, private redraw: () => void) {}

  display(el: HTMLElement): void {
    const vs = this.plugin.vault
    new Setting(el).setName(tr('Sync a folder with OpenTodo')).setHeading()
    el.createEl('p', { cls: 'setting-item-description', text: tr('Keeps one folder of this vault in two-way sync with OpenTodo, with the files and rules of ot vault: one file per project, one line per task. It syncs while Obsidian is open and in front: when the plugin starts, a second after you change a file in the folder, every 30 seconds and with “Sync vault with OpenTodo now”. It does not sync in the background or while Obsidian is closed.') })
    const folder = vs.folder()
    if (folder === null) {
      const s = new Setting(el).setName(tr('Folder')).setDesc(tr('A new folder, or one already synced by ot vault or by this plugin on another device.'))
      s.addDropdown((d) => {
        for (const c of folderChoices(this.app)) d.addOption(c.path, c.label)
        d.setValue(this.choice).onChange((v) => {
          this.choice = v
        })
      })
      s.addButton((b) => b.setButtonText(this.busy ? tr('Syncing…') : tr('Turn on')).setCta().setDisabled(this.busy).onClick(() => void this.turnOn()))
      if (this.message) el.createEl('p', { cls: 'setting-item-description mod-warning', text: this.message })
      return
    }
    const status = new Setting(el).setName(tr('Folder {folder}', { folder: folder || '/' })).setDesc(vaultStatusText(vs.status, this.plugin.owner().label))
    status.settingEl.addClass('opentodo-vault-status')
    status.addButton((b) => b.setButtonText(tr('Sync now')).setDisabled(vs.status.kind === 'syncing').onClick(() => void vs.run('command')))
    if (vs.status.kind === 'owned') status.addButton((b) => b.setButtonText(tr('Take over syncing here')).setWarning().onClick(() => void this.takeOver()))
    if (vs.status.kind === 'locked') status.addButton((b) => b.setButtonText(tr('Unlock OpenTodo')).setCta().onClick(() => this.plugin.unlock()))
    if (this.message) el.createEl('p', { cls: 'setting-item-description mod-warning', text: this.message })
    new Setting(el).setName(tr('Turn off')).setDesc(tr('The files and the folder’s state stay. This device stops syncing them and gives up the folder, so another device or ot vault can sync it.'))
      .addButton((b) => b.setButtonText(tr('Turn off')).onClick(async () => {
        await vs.disable()
        this.message = ''
        this.redraw()
      }))
  }

  async turnOn(): Promise<void> {
    const vs = this.plugin.vault
    const folder = this.choice
    this.message = ''
    let adopt = false
    try {
      const { state, notes } = await vs.check(folder)
      if (!state && notes > 0) {
        const ok = await confirm(this.app, {
          title: tr('Use the notes in {folder}?', { folder }),
          body: [tr('{n, plural, one {# Markdown file} other {# Markdown files}} in this folder become projects in OpenTodo, and their task lines become tasks. Other text in them stays as it is.', { n: notes })],
          ok: tr('Use them'),
        })
        if (!ok) return
        adopt = true
      }
      if (this.plugin.account()?.encrypted) {
        const ok = await confirm(this.app, {
          title: tr('The folder holds your tasks in plain text'),
          body: [tr('This account uses end-to-end encryption. The files of the synced folder hold your tasks in plain text on this device, and in anything that copies the vault, such as Obsidian Sync, iCloud or git.')],
          ok: tr('Sync the folder'),
        })
        if (!ok) return
      }
      this.busy = true
      this.redraw()
      const s = await vs.enable(folder, adopt)
      if (s.kind === 'failed') this.message = s.message
      else if (s.kind === 'disconnected') this.message = tr('Connect OpenTodo first.')
    } catch (err) {
      this.message = err instanceof NeedsAdoptError ? tr('The folder holds Markdown files.') : err instanceof Error ? err.message : String(err)
    } finally {
      this.busy = false
    }
    this.redraw()
  }

  async takeOver(): Promise<void> {
    const s = this.plugin.vault.status
    const label = s.kind === 'owned' ? s.owner.label : ''
    const ok = await confirm(this.app, {
      title: tr('Take over syncing here?'),
      body: [
        tr('{label} syncs this folder now. If it is gone or should not sync the folder any more, this device can take over: it becomes a new vault device, lines that differ from OpenTodo are kept in conflict files, and nothing is created twice.', { label }),
        tr('If {label} syncs again, it is refused until it takes over in turn.', { label }),
      ],
      ok: tr('Take over syncing here'),
      warning: true,
    })
    if (!ok) return
    const r = await this.plugin.vault.takeOver()
    this.message = r.kind === 'failed' ? r.message : ''
    this.redraw()
  }
}
