// The OpenTodo plugin for Obsidian (OpenSpec change obsidian-plugin): send a line
// or a selection of a note to the user's own OpenTodo server as tasks that link
// back to the note. Desktop and mobile; no runtime dependency; requests go only
// to the configured server (README "Network use").
import { getLanguage, Notice, Platform, Plugin, requestUrl, TFile, type Editor, type TAbstractFile } from 'obsidian'
import { KeyRecordParamsError, WrongSecretError } from '../../web/src/lib/crypto'
import { ApiError, Client, NetworkError } from './api'
import { Lists } from './cache'
import { connect, serverAddress, type Account } from './connect'
import { Keyring } from './crypt'
import { devicePrefix } from './ops'
import { Outbox, type PushResult } from './outbox'
import { Sender, DEFAULT_SETTINGS, type Action, type Settings } from './send'
import { OpenTodoSettingTab } from './settingsTab'
import { confirmSend } from './sheet'
import { ACCOUNT_KEYS, appStorage, installId, K, type DeviceStorage } from './storage'
import { currentLanguage, setLanguage, tr } from './strings'
import { askUnlock } from './unlock'
import { ObsidianFiles } from './vault/obsidianFiles'
import type { Owner } from './vault/types'
import { deviceLabel, EVERY_MS, VaultSync, type VaultStatus } from './vaultSync'

/** While tasks wait, the outbox is pushed this often (D9). */
const PUSH_EVERY_MS = 60_000

export default class OpenTodoPlugin extends Plugin {
  settings: Settings = { ...DEFAULT_SETTINGS }
  store!: DeviceStorage
  outbox!: Outbox
  lists!: Lists
  keys!: Keyring
  sender!: Sender
  vault!: VaultSync
  device = ''
  private statusEl: HTMLElement | null = null
  private listeners = new Set<() => void>()

  async onload(): Promise<void> {
    setLanguage(getLanguage())
    this.store = appStorage(this.app)
    this.device = devicePrefix + installId(this.store)
    this.outbox = new Outbox(this.store)
    this.lists = new Lists(this.store)
    this.keys = new Keyring(this.store)
    await this.keys.restore()
    const saved = (await this.loadData()) as Partial<Settings> | null
    this.settings = { ...DEFAULT_SETTINGS, ...pickSettings(saved) }
    this.sender = new Sender({
      store: this.store, outbox: this.outbox, lists: this.lists, keys: this.keys, device: this.device,
      vault: () => this.app.vault.getName(), server: () => this.server(), account: () => this.account(), settings: () => this.settings,
      confirm: (o) => confirmSend(this.app, o), notify: (m, a, ms) => this.notify(m, a, ms), openUrl: (u) => window.open(u),
      openSettings: () => this.openSettings(), unlock: () => this.unlock(), push: () => void this.pushNow(),
      taskProject: async (id) => {
        const c = this.client()
        if (!c) return undefined
        try {
          return (await c.task(id)).project_id ?? null
        } catch {
          return undefined
        }
      },
    }, currentLanguage)
    this.vault = new VaultSync({
      store: this.store, keys: this.keys, client: () => this.client(), account: () => this.account(), server: () => this.server(),
      files: (folder) => new ObsidianFiles(this.app.vault, folder, this.app.fileManager), owner: () => this.owner(),
      visible: () => document.visibilityState !== 'hidden', changed: () => this.changed(),
    })

    this.addCommand({
      id: 'send-line', name: tr('Send line as a task'), icon: 'send',
      editorCallback: (editor, view) => void this.sendFrom(editor, view.file ?? null),
    })
    this.addCommand({ id: 'send-pending', name: tr('Send pending tasks'), icon: 'upload-cloud', callback: () => void this.pushNow(true) })
    this.addCommand({
      id: 'fix-links', name: tr('Fix task links in this note'), icon: 'link',
      editorCallback: (editor, view) => {
        if (view.file) void this.sender.relink(view.file.path, editor.getValue())
      },
    })
    this.addCommand({ id: 'unlock', name: tr('Unlock encrypted account'), icon: 'lock-open', callback: () => this.unlock() })
    this.addCommand({ id: 'sync-vault', name: tr('Sync folder now'), icon: 'refresh-cw', callback: () => void this.syncVaultNow() })
    this.registerEvent(this.app.workspace.on('editor-menu', (menu, editor, view) => {
      menu.addItem((item) => item.setTitle(tr('Send line to OpenTodo')).setIcon('send').onClick(() => void this.sendFrom(editor, view.file ?? null)))
    }))
    this.registerEvent(this.app.vault.on('rename', (file: TAbstractFile, old: string) => {
      void this.renamed(file)
      this.vault.fileChanged(old)
      this.vault.fileChanged(file.path)
    }))
    for (const name of ['modify', 'create', 'delete'] as const) {
      this.registerEvent(this.app.vault.on(name as 'modify', (file: TAbstractFile) => this.vault.fileChanged(file.path)))
    }
    if (!Platform.isMobile) {
      this.statusEl = this.addStatusBarItem()
      this.statusEl.addClass('opentodo-status')
    }
    this.addSettingTab(new OpenTodoSettingTab(this.app, this))
    this.registerDomEvent(window, 'online', () => void this.pushNow())
    this.registerDomEvent(document, 'visibilitychange', () => this.vault.shown())
    this.registerInterval(window.setInterval(() => this.vault.tick(), EVERY_MS))
    this.registerInterval(window.setInterval(() => {
      if (this.outbox.waiting > 0) void this.pushNow()
    }, PUSH_EVERY_MS))
    this.app.workspace.onLayoutReady(() => {
      void this.pushNow()
      void this.vault.run('load')
    })
    this.changed()
  }

  onunload(): void {
    this.vault?.stop()
  }

  // ---- state ----

  /** This installation as the owner of a synced folder (obsidian-vault-sync D4). */
  owner(): Owner {
    return { kind: 'obsidian', install: installId(this.store), label: deviceLabel(Platform) }
  }

  server(): string | null {
    return this.store.get<string>(K.server)
  }

  account(): Account | null {
    return this.store.get<Account>(K.account)
  }

  client(): Client | null {
    const server = this.server()
    const token = this.store.get<string>(K.token)
    return server && token ? new Client(server, token, requestUrl) : null
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  changed(): void {
    const n = this.outbox.waiting
    if (this.statusEl) {
      const parts = [n ? tr('OpenTodo: {n} waiting', { n }) : '', this.vault ? vaultBar(this.vault.status) : ''].filter(Boolean)
      this.statusEl.setText(parts.join(' · '))
      this.statusEl.toggle(parts.length > 0)
    }
    for (const fn of this.listeners) fn()
  }

  /** The vault's data.json holds these three settings and nothing else (D3). */
  async saveSettings(): Promise<void> {
    await this.saveData(pickSettings(this.settings))
  }

  // ---- connect ----

  /** Connects with an address and a token; stores them only when every check passed. Throws ConnectError. */
  async connectWith(address: string, token: string): Promise<Account> {
    const { url } = serverAddress(address)
    const account = await connect(url, token, requestUrl)
    this.store.set(K.server, url)
    this.store.set(K.token, token.trim())
    this.store.set(K.account, account)
    this.store.remove(K.listsAt)
    if (!account.encrypted) this.keys.lock()
    await this.refreshLists(true)
    this.changed()
    void this.pushNow()
    return account
  }

  /** Disconnect: the token, the cached lists, the outbox and any remembered key leave this device. */
  disconnect(): void {
    void this.vault.disable()
    for (const k of ACCOUNT_KEYS) this.store.remove(k)
    this.keys.lock()
    this.changed()
  }

  async refreshLists(force = false): Promise<void> {
    const c = this.client()
    const account = this.account()
    if (!c || !account || (account.encrypted && !this.keys.unlocked)) return
    try {
      await this.lists.refresh(c, account.encrypted ? this.keys : null, { force })
      this.changed()
    } catch {
      // Offline: the sheet keeps the last known lists.
    }
  }

  unlock(): void {
    const c = this.client()
    if (!c) return this.openSettings()
    askUnlock(this.app, async ({ secret, remember }) => {
      try {
        await this.keys.unlock(await c.keyRecord(), secret, remember)
      } catch (err) {
        if (err instanceof WrongSecretError) return tr('That passphrase or recovery key is not correct.')
        if (err instanceof KeyRecordParamsError) return tr('The server’s key record looks wrong, so this device stays locked. Ask the server owner to check the server.')
        if (err instanceof NetworkError) return tr('Could not reach the server. Unlocking needs a connection once.')
        if (err instanceof ApiError && err.code === 'encryption_disabled') {
          this.store.set(K.account, { ...this.account()!, encrypted: false })
          this.changed()
          return null
        }
        return err instanceof Error ? err.message : String(err)
      }
      await this.refreshLists(true)
      this.changed()
      new Notice(tr('OpenTodo is unlocked.'))
      return null
    })
  }

  openSettings(): void {
    const setting = (this.app as unknown as { setting?: { open(): void; openTabById(id: string): void } }).setting
    setting?.open()
    setting?.openTabById(this.manifest.id)
  }

  // ---- sending ----

  private async sendFrom(editor: Editor, file: TFile | null): Promise<void> {
    if (!file) return
    // Lines of the synced folder are vault lines: sending one would make the task twice (D8).
    if (this.vault.covers(file.path)) return this.notify(tr('This line is already synced by the vault.'))
    void this.refreshLists()
    const from = editor.getCursor('from').line
    const to = editor.getCursor('to').line
    await this.sender.sendLines(editor, file.path, from, to)
    this.changed()
  }

  private async renamed(file: TAbstractFile): Promise<void> {
    if (!(file instanceof TFile) || file.extension !== 'md' || !this.account()) return
    const text = await this.app.vault.cachedRead(file)
    await this.sender.relink(file.path, text, { quiet: true })
    this.changed()
  }

  /** Pushes the outbox; with `report`, says what happened even when nothing was waiting. */
  async pushNow(report = false): Promise<PushResult | null> {
    const c = this.client()
    if (!c) {
      if (report) this.notify(tr('Connect OpenTodo in the plugin settings first.'), [{ label: tr('Open settings'), run: () => this.openSettings() }])
      return null
    }
    if (this.outbox.waiting === 0) {
      if (report) this.notify(tr('Nothing is waiting to be sent.'))
      return { kind: 'idle' }
    }
    const res = await this.outbox.push(c, this.device)
    this.changed()
    if (res.kind === 'pushed') {
      for (const r of res.refused) {
        const project = this.lists.projects().find((p) => p.id === r.entry.project)?.name ?? tr('Inbox')
        this.notify(tr('OpenTodo refused “{title}” from {note} for {project}: {reason}', { title: r.entry.title || r.entry.taskId, note: r.entry.note, project, reason: r.message || r.reason }), [], 0)
      }
      if (report && res.refused.length === 0) this.notify(tr('{n, plural, one {# change sent} other {# changes sent}}', { n: res.sent.length }))
    } else if (res.kind === 'unauthorized') {
      this.notify(tr('OpenTodo did not accept this device’s token any more. Connect again in the plugin settings.'), [{ label: tr('Open settings'), run: () => this.openSettings() }], 0)
    } else if (report && res.kind === 'offline') {
      this.notify(tr('OpenTodo cannot be reached right now. The tasks stay waiting on this device.'))
    } else if (report && res.kind === 'failed') {
      this.notify(res.message)
    }
    return res
  }

  /** "Sync folder now": runs a sync and says how it went. */
  async syncVaultNow(): Promise<VaultStatus> {
    if (this.vault.folder() === null) {
      this.notify(tr('Vault sync is off. Turn it on in the plugin settings.'), [{ label: tr('Open settings'), run: () => this.openSettings() }])
      return this.vault.status
    }
    const s = await this.vault.run('command')
    if (s.kind === 'synced') this.notify(s.report.events.length ? tr('{n, plural, one {# change} other {# changes}} synced with OpenTodo.', { n: s.report.events.length }) : tr('The vault is up to date.'))
    else if (s.kind === 'locked') this.notify(tr('Unlock OpenTodo to sync the vault.'), [{ label: tr('Unlock OpenTodo'), run: () => this.unlock() }])
    else if (s.kind === 'owned') this.notify(tr('{label} syncs this folder. Take over in the plugin settings to sync it here.', { label: s.owner.label }), [{ label: tr('Open settings'), run: () => this.openSettings() }])
    else if (s.kind === 'failed' || s.kind === 'disconnected' || s.kind === 'tasknotes') this.notify(s.kind === 'failed' ? s.message : s.kind === 'tasknotes' ? tr('This folder has a TaskNotes folder linked; keep syncing it with ot vault.') : tr('Connect OpenTodo first.'))
    return s
  }

  notify(message: string, actions: Action[] = [], ms = 5000): void {
    const notice = new Notice(message, ms)
    for (const a of actions) {
      const b = notice.messageEl.createEl('button', { cls: 'opentodo-notice-action', text: a.label })
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        notice.hide()
        a.run()
      })
    }
  }
}

/** Only the three settings of the settings file, whatever an older version or a hand edit left there. */
export function pickSettings(v: Partial<Settings> | null | undefined): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS }
  if (v && (typeof v.defaultProject === 'string' || v.defaultProject === null)) out.defaultProject = v.defaultProject
  if (v && (v.afterSending === 'link' || v.afterSending === 'done' || v.afterSending === 'remove')) out.afterSending = v.afterSending
  if (v && typeof v.sendWithoutAsking === 'boolean') out.sendWithoutAsking = v.sendWithoutAsking
  return out
}


/** The vault's part of the desktop status bar. */
function vaultBar(s: VaultStatus): string {
  switch (s.kind) {
    case 'syncing': return tr('OpenTodo vault: syncing…')
    case 'failed': return tr('OpenTodo vault: sync failed')
    case 'locked': return tr('OpenTodo vault: locked')
    case 'owned': return tr('OpenTodo vault: synced by {label}', { label: s.owner.label })
    default: return ''
  }
}
