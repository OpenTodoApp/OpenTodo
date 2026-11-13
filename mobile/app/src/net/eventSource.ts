// The live stream (design D6). React Native has no EventSource, so this is the part of
// it the shared sync engine uses (onopen, onerror, named events, close), over an
// XMLHttpRequest that reports the text as it arrives, sent with the account's token.
//
// In the background there is no stream: one that is open is dropped once the outbox has
// drained (dropStreams, called by src/sync.ts), and one that is asked for fails at once.
// The engine sees a lost connection either way and opens a new one when the app comes
// to the front.
import type { Session } from '../auth/tokens'

/** Reconnect instead of keeping this much of the stream's text in memory. */
const MAX_TEXT = 256 * 1024

type Listener = (ev: { data: string }) => void

export interface StreamHost {
  session(): Session | null
  visible(): boolean
  XHR?: typeof XMLHttpRequest
}

const open = new Set<{ drop(): void }>()

/** Ends every open stream as a lost connection. */
export function dropStreams(): void {
  for (const s of [...open]) s.drop()
}

export function eventSourceClass(host: StreamHost) {
  return class AppEventSource {
    onopen: (() => void) | null = null
    onerror: (() => void) | null = null
    private listeners = new Map<string, Set<Listener>>()
    private xhr: XMLHttpRequest | null = null
    private closed = false
    private read = 0
    private rest = ''
    private event = ''
    private data: string[] = []

    constructor(private path: string) {
      open.add(this)
      // Like the browser's: the connection starts after the caller set its handlers.
      setTimeout(() => { void this.connect() }, 0)
    }

    addEventListener(type: string, fn: Listener): void {
      let set = this.listeners.get(type)
      if (!set) this.listeners.set(type, (set = new Set()))
      set.add(fn)
    }

    close(): void {
      this.closed = true
      open.delete(this)
      this.xhr?.abort()
      this.xhr = null
    }

    /** The connection is lost: the engine closes this one and tries again later. */
    drop(): void {
      if (this.closed) return
      this.close()
      this.onerror?.()
    }

    private async connect(): Promise<void> {
      const session = host.session()
      if (this.closed) return
      if (!session || !host.visible()) return this.drop()
      const token = await session.access().catch(() => null)
      if (this.closed) return
      if (!token) return this.drop()
      const xhr = new (host.XHR ?? XMLHttpRequest)()
      this.xhr = xhr
      xhr.open('GET', session.server + this.path)
      xhr.setRequestHeader('Accept', 'text/event-stream')
      xhr.setRequestHeader('Cache-Control', 'no-cache')
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      let opened = false
      xhr.onreadystatechange = () => {
        if (this.closed || opened || xhr.readyState < 2) return
        if (xhr.status === 200) {
          opened = true
          this.onopen?.()
          return
        }
        // An expired token: have a new one ready for the engine's next attempt.
        if (xhr.status === 401) void session.access(true).catch(() => undefined)
        if (xhr.status !== 0) this.drop()
      }
      xhr.onprogress = () => {
        if (this.closed) return
        const text = xhr.responseText
        this.parse(text.slice(this.read))
        this.read = text.length
        if (this.read > MAX_TEXT) this.drop()
      }
      // The server ended the stream, or the network did.
      xhr.onload = xhr.onerror = xhr.ontimeout = () => this.drop()
      xhr.send()
    }

    /** Server-sent events: `event:` and `data:` lines, dispatched at each blank line. */
    private parse(chunk: string): void {
      const lines = (this.rest + chunk).split(/\r\n|\n|\r/)
      this.rest = lines.pop() ?? ''
      for (const line of lines) {
        if (line === '') {
          if (this.data.length) {
            const ev = { data: this.data.join('\n') }
            for (const fn of [...(this.listeners.get(this.event || 'message') ?? [])]) fn(ev)
          }
          this.event = ''
          this.data = []
          continue
        }
        if (line.startsWith(':')) continue
        const colon = line.indexOf(':')
        const field = colon < 0 ? line : line.slice(0, colon)
        const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
        if (field === 'event') this.event = value
        else if (field === 'data') this.data.push(value)
      }
    }
  }
}
