// An in-memory stand-in for the `obsidian` module in unit tests (vitest.config.mjs
// aliases it). Only what the plugin uses, with the same shapes; requestUrl goes
// to whatever handler a test installs with setRequestHandler.
import type { RequestUrlParam, RequestUrlResponse } from 'obsidian'

type Handler = (req: RequestUrlParam) => Promise<RequestUrlResponse> | RequestUrlResponse

let handler: Handler = (req) => {
  throw new Error(`Unexpected request in a test: ${req.method ?? 'GET'} ${req.url}`)
}

export const requests: RequestUrlParam[] = []

export function setRequestHandler(h: Handler): void {
  handler = h
  requests.length = 0
}

export function requestUrl(req: RequestUrlParam | string): Promise<RequestUrlResponse> {
  const r = typeof req === 'string' ? { url: req } : req
  requests.push(r)
  return Promise.resolve().then(() => handler(r))
}

/** A JSON answer for a request handler. */
export function json(status: number, body: unknown): RequestUrlResponse {
  const text = JSON.stringify(body)
  return { status, text, json: body, headers: {}, arrayBuffer: new ArrayBuffer(0) } as RequestUrlResponse
}

let language = 'en'
export function setLanguageForTest(code: string): void {
  language = code
}
export function getLanguage(): string {
  return language
}

export const Platform = { isMobile: false, isDesktop: true, isDesktopApp: true, isMobileApp: false }

export const notices: { message: string; actions: string[]; timeout?: number; el: HTMLElement }[] = []

export class Notice {
  noticeEl: HTMLElement
  constructor(message: string | DocumentFragment, timeout?: number) {
    this.noticeEl = document.createElement('div')
    const text = typeof message === 'string' ? message : message.textContent ?? ''
    this.noticeEl.append(text)
    notices.push({ message: text, actions: [], timeout, el: this.noticeEl })
  }
  setMessage(): this {
    return this
  }
  hide(): void {}
}

export class Modal {
  contentEl: HTMLElement
  modalEl: HTMLElement
  constructor(public app: unknown) {
    this.modalEl = document.createElement('div')
    this.contentEl = document.createElement('div')
    this.modalEl.append(this.contentEl)
  }
  open(): void {
    document.body.append(this.modalEl)
    this.onOpen()
  }
  close(): void {
    this.modalEl.remove()
    this.onClose()
  }
  onOpen(): void {}
  onClose(): void {}
}

export function setIcon(el: HTMLElement, icon: string): void {
  el.setAttribute('data-icon', icon)
}

export class TAbstractFile {
  constructor(public path: string) {}
  get name(): string {
    return this.path.slice(this.path.lastIndexOf('/') + 1)
  }
}

export class TFolder extends TAbstractFile {}

export class TFile extends TAbstractFile {
  get extension(): string {
    return this.name.slice(this.name.lastIndexOf('.') + 1)
  }
  get basename(): string {
    return this.name.replace(/\.[^.]*$/, '')
  }
}

type Listener = (...args: unknown[]) => unknown

class Events {
  private on_: Map<string, Listener[]> = new Map()
  on(name: string, fn: Listener) {
    this.on_.set(name, [...(this.on_.get(name) ?? []), fn])
    return { name, fn }
  }
  trigger(name: string, ...args: unknown[]): unknown[] {
    return (this.on_.get(name) ?? []).map((fn) => fn(...args))
  }
}

/**
 * A vault of in-memory files: `files` holds every file by vault path, hidden
 * ones too; Vault methods see the indexed (not hidden) ones, as Obsidian's
 * index does; `adapter` sees them all, as the DataAdapter does.
 */
function memoryVault(files: Map<string, string>, folders: Set<string>) {
  const hidden = (p: string) => p.split('/').some((x) => x.startsWith('.'))
  const parentOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
  const events = new Events()
  const log: string[] = []
  const vault = Object.assign(events, {
    log,
    getName: () => 'Work notes',
    cachedRead: async (f: TFile) => files.get(f.path) ?? '',
    read: async (f: TFile) => files.get(f.path) ?? '',
    getAbstractFileByPath: (p: string) => (files.has(p) && !hidden(p) ? new TFile(p) : folders.has(p) && !hidden(p) ? new TFolder(p) : null),
    getAllFolders: () => [...folders].filter((f) => !hidden(f)).map((f) => new TFolder(f)),
    process: async (f: TFile, fn: (data: string) => string) => {
      const next = fn(files.get(f.path) ?? '')
      log.push(`process ${f.path}`)
      files.set(f.path, next)
      return next
    },
    create: async (p: string, text: string) => {
      if (files.has(p)) throw new Error('File already exists.')
      if (parentOf(p) && !folders.has(parentOf(p))) throw new Error('Folder does not exist.')
      log.push(`create ${p}`)
      files.set(p, text)
      return new TFile(p)
    },
    createFolder: async (p: string) => {
      folders.add(p)
      return new TFolder(p)
    },
    delete: async (f: TAbstractFile) => {
      log.push(`delete ${f.path}`)
      files.delete(f.path)
      folders.delete(f.path)
    },
    adapter: {
      exists: async (p: string) => files.has(p) || folders.has(p),
      read: async (p: string) => {
        const t = files.get(p)
        if (t === undefined) throw new Error(`ENOENT ${p}`)
        return t
      },
      write: async (p: string, text: string) => {
        if (parentOf(p) && !folders.has(parentOf(p))) throw new Error('ENOENT folder')
        log.push(`write ${p}`)
        files.set(p, text)
      },
      remove: async (p: string) => {
        log.push(`remove ${p}`)
        files.delete(p)
      },
      rename: async (a: string, b: string) => {
        if (files.has(b)) throw new Error('Destination file already exists!')
        log.push(`rename ${a} ${b}`)
        files.set(b, files.get(a)!)
        files.delete(a)
      },
      mkdir: async (p: string) => {
        folders.add(p)
      },
      rmdir: async (p: string) => {
        folders.delete(p)
      },
      list: async (dir: string) => {
        const d = dir === '/' ? '' : dir
        const inDir = (p: string) => parentOf(p) === d
        return { files: [...files.keys()].filter(inDir).sort(), folders: [...folders].filter(inDir).sort() }
      },
    },
  })
  return vault
}

/** An App with a vault of in-memory files and per-device storage. */
export class App {
  local = new Map<string, unknown>()
  files = new Map<string, string>()
  folders = new Set<string>()
  vault = memoryVault(this.files, this.folders)
  workspace = Object.assign(new Events(), { onLayoutReady: (fn: () => void) => fn() })
  loadLocalStorage(key: string): unknown {
    return this.local.has(key) ? structuredClone(this.local.get(key)) : null
  }
  saveLocalStorage(key: string, data: unknown): void {
    if (data === null) this.local.delete(key)
    else this.local.set(key, structuredClone(data))
  }
}

export class Plugin {
  data: unknown = null
  saved: unknown[] = []
  commands: { id: string; name: string; callback?: () => unknown; editorCallback?: (e: unknown, v: unknown) => unknown }[] = []
  tabs: unknown[] = []
  constructor(public app: App, public manifest: { id: string; version: string }) {}
  async loadData(): Promise<unknown> {
    return structuredClone(this.data)
  }
  async saveData(d: unknown): Promise<void> {
    this.saved.push(structuredClone(d))
    this.data = structuredClone(d)
  }
  addCommand(c: Plugin['commands'][number]) {
    this.commands.push(c)
    return c
  }
  registerEvent(): void {}
  registerDomEvent(): void {}
  registerInterval(id: number): number {
    clearInterval(id)
    return id
  }
  addStatusBarItem(): HTMLElement {
    const el = document.createElement('div') as HTMLElement & { setText(t: string | DocumentFragment): void; toggle(on: boolean): void; addClass(c: string): void }
    el.setText = (t: string | DocumentFragment) => (el.textContent = typeof t === "string" ? t : t.textContent)
    el.toggle = (on) => (el.hidden = !on)
    el.addClass = (c) => el.classList.add(c)
    return el
  }
  addSettingTab(tab: unknown): void {
    this.tabs.push(tab)
  }
}

export class PluginSettingTab {
  containerEl: HTMLElement
  constructor(public app: App, public plugin: Plugin) {
    this.containerEl = document.createElement('div')
  }
}

// Obsidian's additions to HTMLElement that the settings tab uses.
if (typeof HTMLElement !== 'undefined') {
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>
  proto.empty ??= function (this: HTMLElement) {
    this.replaceChildren()
  }
  proto.addClass ??= function (this: HTMLElement, c: string) {
    this.classList.add(c)
  }
  proto.createEl ??= function (this: HTMLElement, tag: string, o: { cls?: string; text?: string } = {}) {
    const el = document.createElement(tag)
    if (o.cls) el.className = o.cls
    if (o.text) el.textContent = o.text
    this.append(el)
    return el
  }
}

/** A button, text field, dropdown or toggle of a Setting, with Obsidian's chained setters. */
class Component {
  constructor(public el: HTMLElement) {}
  setButtonText(t: string) { this.el.textContent = t; return this }
  setCta() { this.el.classList.add('mod-cta'); return this }
  setWarning() { this.el.classList.add('mod-warning'); return this }
  setDisabled(d: boolean) { (this.el as HTMLButtonElement).disabled = d; return this }
  setTooltip() { return this }
  setIcon() { return this }
  setPlaceholder() { return this }
  onClick(fn: () => unknown) { this.el.addEventListener('click', () => void fn()); return this }
  get inputEl() { return this.el as HTMLInputElement }
  get selectEl() { return this.el as HTMLSelectElement }
  setValue(v: string | boolean) {
    if (this.el instanceof HTMLInputElement && this.el.type === 'checkbox') this.el.checked = Boolean(v)
    else (this.el as HTMLInputElement).value = String(v)
    return this
  }
  addOption(value: string, label: string) {
    const o = document.createElement('option')
    o.value = value
    o.textContent = label
    this.el.append(o)
    return this
  }
  onChange(fn: (v: never) => unknown) {
    this.el.addEventListener('change', () => void fn(((this.el as HTMLInputElement).type === 'checkbox' ? (this.el as HTMLInputElement).checked : (this.el as HTMLInputElement).value) as never))
    return this
  }
}

export class Setting {
  settingEl: HTMLElement
  nameEl: HTMLElement
  descEl: HTMLElement
  controlEl: HTMLElement
  constructor(public el: HTMLElement) {
    this.settingEl = document.createElement('div')
    this.settingEl.className = 'setting-item'
    this.nameEl = document.createElement('div')
    this.nameEl.className = 'setting-item-name'
    this.descEl = document.createElement('div')
    this.descEl.className = 'setting-item-description'
    this.controlEl = document.createElement('div')
    this.controlEl.className = 'setting-item-control'
    this.settingEl.append(this.nameEl, this.descEl, this.controlEl)
    el.append(this.settingEl)
  }
  setName(n: string) { this.nameEl.textContent = n; return this }
  setDesc(d: string) { this.descEl.textContent = d; return this }
  setHeading() { this.settingEl.classList.add('setting-item-heading'); return this }
  private add(tag: string, fn: (c: Component) => unknown, type?: string) {
    const el = document.createElement(tag)
    if (type) (el as HTMLInputElement).type = type
    this.controlEl.append(el)
    fn(new Component(el))
    return this
  }
  addButton(fn: (c: Component) => unknown) { return this.add('button', fn) }
  addExtraButton(fn: (c: Component) => unknown) { return this.add('button', fn) }
  addText(fn: (c: Component) => unknown) { return this.add('input', fn, 'text') }
  addDropdown(fn: (c: Component) => unknown) { return this.add('select', fn) }
  addToggle(fn: (c: Component) => unknown) { return this.add('input', fn, 'checkbox') }
}

export function debounce<T extends (...a: never[]) => unknown>(fn: T): T {
  return fn
}
