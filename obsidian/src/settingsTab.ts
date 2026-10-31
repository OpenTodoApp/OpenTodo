// Settings → Community plugins → OpenTodo (obsidian-plugin task 3.2): the server
// and token (kept on this device only), the connection's status, and the three
// settings the vault's data.json carries.
import { PluginSettingTab, Setting, type App } from 'obsidian'
import type OpenTodoPlugin from './main'
import { ConnectError, serverAddress } from './connect'
import { sheetProjects } from './send'
import { tr } from './strings'

export class OpenTodoSettingTab extends PluginSettingTab {
  private address = ''
  private token = ''
  private message = ''
  private suggestion: string | null = null
  /** Plain http to a private address needs a second press of Connect after the warning. */
  private httpConfirmed = ''
  private busy = false
  private off: (() => void) | null = null

  constructor(app: App, private plugin: OpenTodoPlugin) {
    super(app, plugin)
  }

  display(): void {
    this.off ??= this.plugin.onChange(() => {
      if (this.containerEl.isConnected) this.display()
    })
    const { containerEl: el } = this
    el.empty()
    const account = this.plugin.account()
    const server = this.plugin.server()
    if (account && server) this.connected(el, account, server)
    else this.connectForm(el)
    this.preferences(el)
  }

  hide(): void {
    this.off?.()
    this.off = null
  }

  private connectForm(el: HTMLElement): void {
    new Setting(el).setName(tr('Connect to OpenTodo')).setHeading()
    el.createEl('p', { cls: 'setting-item-description', text: tr('The plugin talks only to the server you enter here. Create a full token for it in OpenTodo under Settings → Integrations → API tokens, named after this device. The token stays on this device and is not written into the vault.') })
    new Setting(el).setName(tr('Server address')).setDesc(tr('The address you open OpenTodo at.')).addText((t) => {
      t.setPlaceholder('todo.example.com').setValue(this.address).onChange((v) => {
        this.address = v
      })
      t.inputEl.autocapitalize = 'off'
      t.inputEl.spellcheck = false
    })
    new Setting(el).setName(tr('API token')).addText((t) => {
      t.inputEl.type = 'password'
      t.inputEl.autocomplete = 'off'
      t.setValue(this.token).onChange((v) => {
        this.token = v
      })
    })
    const status = new Setting(el).addButton((b) => b.setButtonText(this.busy ? tr('Connecting…') : tr('Connect')).setCta().setDisabled(this.busy).onClick(() => void this.connect()))
    if (this.suggestion) {
      const s = this.suggestion
      status.addButton((b) => b.setButtonText(tr('Use {address}', { address: s })).onClick(() => {
        this.address = s
        this.suggestion = null
        void this.connect()
      }))
    }
    if (this.message) status.setDesc(this.message)
  }

  private async connect(): Promise<void> {
    this.suggestion = null
    try {
      const { url, plainHttp } = serverAddress(this.address)
      if (plainHttp && this.httpConfirmed !== url) {
        this.httpConfirmed = url
        this.message = tr('{address} uses plain http: anyone on this network could read the token and your tasks. Press Connect again to use it anyway.', { address: url })
        return this.display()
      }
      this.busy = true
      this.message = ''
      this.display()
      await this.plugin.connectWith(this.address, this.token)
      this.token = ''
      this.address = ''
    } catch (err) {
      this.message = err instanceof Error ? err.message : String(err)
      if (err instanceof ConnectError && err.suggestion) this.suggestion = err.suggestion
    } finally {
      this.busy = false
    }
    this.display()
  }

  private connected(el: HTMLElement, account: NonNullable<ReturnType<OpenTodoPlugin['account']>>, server: string): void {
    new Setting(el).setName(tr('OpenTodo')).setHeading()
    const who = account.name || account.email || account.userId
    const parts = [tr('Connected to {server} as {who}', { server, who }), tr('OpenTodo {version}', { version: account.serverVersion || '?' })]
    if (account.encrypted) parts.push(this.plugin.keys.unlocked ? tr('Encrypted, unlocked') : tr('Encrypted, locked'))
    const waiting = this.plugin.outbox.waiting
    parts.push(tr('{n, plural, =0 {Nothing waiting} other {# waiting}}', { n: waiting }))
    const status = new Setting(el).setName(tr('Status')).setDesc(parts.join(' · '))
    status.settingEl.addClass('opentodo-status-line')
    if (waiting) status.addButton((b) => b.setButtonText(tr('Send pending')).onClick(() => void this.plugin.pushNow(true)))
    if (account.encrypted && !this.plugin.keys.unlocked) status.addButton((b) => b.setButtonText(tr('Unlock OpenTodo')).setCta().onClick(() => this.plugin.unlock()))
    if (account.encrypted && this.plugin.keys.unlocked) {
      status.addButton((b) => b.setButtonText(tr('Lock')).onClick(() => {
        this.plugin.keys.lock()
        this.plugin.changed()
      }))
    }
    new Setting(el).setName(tr('Disconnect')).setDesc(waiting
      ? tr('{n, plural, one {# task is still waiting and is discarded} other {# tasks are still waiting and are discarded}}. The token, the cached projects and labels and any remembered key are removed from this device.', { n: waiting })
      : tr('The token, the cached projects and labels and any remembered key are removed from this device.'))
      .addButton((b) => b.setButtonText(tr('Disconnect')).setWarning().onClick(() => {
        this.plugin.disconnect()
        this.display()
      }))
  }

  private preferences(el: HTMLElement): void {
    new Setting(el).setName(tr('Sending')).setHeading()
    const projects = sheetProjects(this.plugin.lists)
    new Setting(el).setName(tr('Default project')).setDesc(tr('Where new tasks go unless the line names a project.')).addDropdown((d) => {
      d.addOption('', tr('Inbox'))
      for (const p of projects) d.addOption(p.id, ' '.repeat(p.depth) + p.name)
      const current = this.plugin.settings.defaultProject
      if (current && !projects.some((p) => p.id === current)) d.addOption(current, tr('A project this device does not know yet'))
      d.setValue(current ?? '').onChange(async (v) => {
        this.plugin.settings.defaultProject = v || null
        await this.plugin.saveSettings()
      })
    }).addExtraButton((b) => b.setIcon('refresh-cw').setTooltip(tr('Reload projects and labels')).onClick(() => void this.plugin.refreshLists(true)))
    new Setting(el).setName(tr('After sending')).setDesc(tr('What happens to the line in the note.')).addDropdown((d) => d
      .addOption('link', tr('Add a link to the task'))
      .addOption('done', tr('Mark the line done'))
      .addOption('remove', tr('Remove the line'))
      .setValue(this.plugin.settings.afterSending)
      .onChange(async (v) => {
        this.plugin.settings.afterSending = v as 'link' | 'done' | 'remove'
        await this.plugin.saveSettings()
      }))
    new Setting(el).setName(tr('Send without asking')).setDesc(tr('Skip the sheet that shows what was recognised before sending.')).addToggle((t) => t
      .setValue(this.plugin.settings.sendWithoutAsking)
      .onChange(async (v) => {
        this.plugin.settings.sendWithoutAsking = v
        await this.plugin.saveSettings()
      }))
  }
}
