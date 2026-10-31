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

/** An App with a vault of in-memory files and per-device storage. */
export class App {
  local = new Map<string, unknown>()
  files = new Map<string, string>()
  vault = Object.assign(new Events(), {
    getName: () => 'Work notes',
    cachedRead: async (f: TFile) => this.files.get(f.path) ?? '',
  })
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

export class Setting {
  constructor(public el: HTMLElement) {}
}

export function debounce<T extends (...a: never[]) => unknown>(fn: T): T {
  return fn
}
