// Model provider requests from the device (assistant-on-device D9): `fetch` with
// streamed server-sent events, no SDK in the browser. Anthropic's Messages API
// (with its browser access header) and the Chat Completions format for OpenAI,
// Gemini and model servers; the same requests as internal/assistant's adapters.
import { manifest, type ManifestTool } from './manifest'
import { baseUrlOf, type DeviceSetup } from './settings'

export type Stop = 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'pause_turn' | string

export interface ToolCall { id: string; name: string; args: string }
export interface ToolResult { id: string; content: string; isError: boolean }

export interface Round {
  stop: Stop
  rawStop: string
  toolCalls: ToolCall[]
  input: number
  output: number
}

export interface Message { role: 'user' | 'assistant'; text: string }

export interface Request {
  system: string
  messages: Message[]
  tools: ManifestTool[]
  maxTokens: number
}

export interface Conversation {
  next(onText: (delta: string) => void, signal?: AbortSignal): Promise<Round>
  addToolResults(results: ToolResult[]): void
}

export interface Provider { start(req: Request): Conversation }

/** A failed provider request: a code the panel describes, never the key or request content. */
export class ProviderError extends Error {
  constructor(public code: 'provider_auth' | 'provider_rate_limited' | 'provider_not_found' | 'provider_error' | 'blocked', message: string, public status = 0, public type = '') {
    super(message)
  }
}

export type Fetch = typeof fetch

/** The panel's code for a device failure: the key and the model are this device's, and a block may need a reload. */
export function deviceCode(code: string): string {
  switch (code) {
    case 'provider_auth': return 'device_auth'
    case 'provider_not_found': return 'device_not_found'
    case 'no_tool_support': return 'device_no_tool_support'
    case 'blocked': return 'device_blocked'
  }
  return code
}

/** At most this much of an error answer is read (internal/assistant maxErrorBody). */
const MAX_ERROR_BODY = 4096

/**
 * The type and invalid-key mark of an error body (readChatError in Go): an
 * object {error} or an array whose first element is one. The type is the
 * error's `type`, else its string `code`, else its `status`, clipped. The
 * provider's message is read only to recognise an invalid key, then dropped.
 */
export function readChatError(body: string): { type: string; badKey: boolean } {
  let v: unknown
  try { v = JSON.parse(body) } catch { return { type: '', badKey: false } }
  if (Array.isArray(v)) v = v[0]
  const e = (v && typeof v === 'object' ? (v as { error?: unknown }).error : null) as Record<string, unknown> | null
  if (!e || typeof e !== 'object' || Array.isArray(e)) return { type: '', badKey: false }
  const str = (x: unknown) => (typeof x === 'string' ? x : '')
  const code = str(e.code)
  const type = clip(str(e.type) || code || str(e.status))
  const details = Array.isArray(e.details) ? e.details : []
  const badKey = details.some((d) => d && typeof d === 'object' && (d as { reason?: unknown }).reason === 'API_KEY_INVALID') ||
    code === 'invalid_api_key' || (str(e.status) === 'INVALID_ARGUMENT' && str(e.message).toLowerCase().includes('api key'))
  return { type, badKey }
}

/** A provider's error type kept short and on one line (clip in Go: 64 bytes, whole characters). */
function clip(s: string): string {
  const enc = new TextEncoder()
  let out = ''
  let n = 0
  for (const ch of s) {
    n += enc.encode(ch).length
    if (n > 64) break
    out += ch
  }
  return out.replace(/[\u0000-\u001f\u007f]/g, '')
}

/** Classify a failed request from its status and error body (chatError in Go). */
export function statusError(status: number, body = '', provider = ''): ProviderError {
  const { type, badKey } = provider === 'anthropic' ? { type: '', badKey: false } : readChatError(body)
  if (status === 401 || status === 403 || (status === 400 && badKey)) return new ProviderError('provider_auth', 'the provider rejected the API key saved on this device', status, type)
  if (status === 404 && provider !== 'anthropic') {
    const where = provider === 'compatible' ? ' and the model server address (it usually ends in /v1)' : ''
    return new ProviderError('provider_not_found', `the provider has no such model or endpoint (HTTP 404): check the model id${where}`, status, type)
  }
  if (status === 429) return new ProviderError('provider_rate_limited', 'the provider is rate limiting requests; try again in a moment', status, type)
  if (status >= 500) return new ProviderError('provider_error', 'the provider had a problem; try again in a moment', status, type)
  return new ProviderError('provider_error', `the provider refused the request (HTTP ${status})`, status, type)
}

/** Up to MAX_ERROR_BODY bytes of an error answer, as text. */
async function errorBody(res: Response): Promise<string> {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const parts: Uint8Array[] = []
  let n = 0
  try {
    while (n < MAX_ERROR_BODY) {
      const { done, value } = await reader.read()
      if (done) break
      parts.push(value)
      n += value.length
    }
  } catch {
    return ''
  } finally {
    await reader.cancel().catch(() => {})
  }
  const all = new Uint8Array(Math.min(n, MAX_ERROR_BODY))
  let off = 0
  for (const p of parts) {
    const take = p.subarray(0, all.length - off)
    all.set(take, off)
    off += take.length
    if (off >= all.length) break
  }
  return new TextDecoder().decode(all)
}

/** POST and return the response, mapping failures that happen before the stream. */
async function post(f: Fetch, provider: string, url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<Response> {
  let res: Response
  try {
    res = await f(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'text/event-stream', ...headers }, body: JSON.stringify(body), signal, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' })
  } catch (err) {
    if (signal?.aborted) throw err
    // fetch gives no detail on purpose: the page's policy, the provider's cross-origin rules or the network.
    throw new ProviderError('blocked', 'the provider could not be reached from this page: the network, the server owner\'s allowed providers or the provider\'s cross-origin rules blocked it')
  }
  if (!res.ok || !res.body) throw statusError(res.status, await errorBody(res), provider)
  return res
}

/** Server-sent events of a response body: {event, data} per blank-line-terminated event. */
export async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let event = 'message'
  let data: string[] = []
  const flushLine = function* (line: string): Generator<{ event: string; data: string }> {
    if (line.endsWith('\r')) line = line.slice(0, -1)
    if (line === '') {
      if (data.length) yield { event, data: data.join('\n') }
      event = 'message'
      data = []
    } else if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
  }
  for (;;) {
    const { done, value } = await reader.read()
    buf += done ? dec.decode() : dec.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl)
      buf = buf.slice(nl + 1)
      yield* flushLine(line)
    }
    if (done) break
  }
  if (buf) yield* flushLine(buf)
  yield* flushLine('')
}

// ------------------------------------------------------------------ Anthropic

type Block = Record<string, unknown> & { type: string }

/** Alternating turns starting with the user (anthropicMessages in Go). */
function alternate(msgs: Message[]): Message[] {
  const out: Message[] = []
  for (const m of msgs) {
    if (!m.text) continue
    if (!out.length && m.role === 'assistant') continue
    const last = out[out.length - 1]
    if (last && last.role === m.role) last.text += '\n\n' + m.text
    else out.push({ ...m })
  }
  return out
}

export function anthropicProvider(setup: DeviceSetup, f: Fetch = fetch): Provider {
  return {
    start(req) {
      const messages: { role: string; content: unknown }[] = alternate(req.messages).map((m) => ({ role: m.role, content: [{ type: 'text', text: m.text }] }))
      const tools = req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.strict_schema, strict: true }))
      return {
        async next(onText, signal) {
          const body = {
            model: setup.model, max_tokens: req.maxTokens, system: [{ type: 'text', text: req.system }], messages, tools, tool_choice: { type: 'auto' },
            thinking: { type: 'adaptive' }, output_config: { effort: 'medium' }, cache_control: { type: 'ephemeral' }, stream: true,
          }
          const res = await post(f, 'anthropic', baseUrlOf(setup) + '/messages', {
            'x-api-key': setup.key ?? '', 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true',
          }, body, signal)
          const blocks: Block[] = []
          const json: string[] = []
          const r: Round = { stop: '', rawStop: '', toolCalls: [], input: 0, output: 0 }
          for await (const ev of sseEvents(res.body!)) {
            let d: Record<string, any>
            try { d = JSON.parse(ev.data) } catch { throw new ProviderError('provider_error', 'the provider sent a stream this device could not read') }
            switch (d.type) {
              case 'message_start': {
                const u = d.message?.usage ?? {}
                r.input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)
                r.output = u.output_tokens ?? 0
                break
              }
              case 'content_block_start':
                blocks[d.index] = { ...d.content_block }
                json[d.index] = ''
                break
              case 'content_block_delta': {
                const b = blocks[d.index]
                const dl = d.delta ?? {}
                if (!b) break
                if (dl.type === 'text_delta') { b.text = String(b.text ?? '') + dl.text; if (dl.text) onText(dl.text) }
                else if (dl.type === 'thinking_delta') b.thinking = String(b.thinking ?? '') + dl.thinking
                else if (dl.type === 'signature_delta') b.signature = String(b.signature ?? '') + dl.signature
                else if (dl.type === 'input_json_delta') json[d.index] += dl.partial_json ?? ''
                break
              }
              case 'content_block_stop': {
                const b = blocks[d.index]
                if (b?.type === 'tool_use') {
                  try { b.input = json[d.index] ? JSON.parse(json[d.index]) : (b.input ?? {}) } catch { b.input = {} }
                }
                break
              }
              case 'message_delta':
                if (d.delta?.stop_reason) r.rawStop = d.delta.stop_reason
                if (d.usage?.output_tokens !== undefined) r.output = d.usage.output_tokens
                break
              case 'error':
                throw new ProviderError(d.error?.type === 'overloaded_error' ? 'provider_rate_limited' : 'provider_error', 'the provider reported an error while answering')
            }
          }
          switch (r.rawStop) {
            case 'end_turn': case 'stop_sequence': r.stop = 'end_turn'; break
            case 'tool_use': r.stop = 'tool_use'; break
            case 'max_tokens': case 'model_context_window_exceeded': r.stop = 'max_tokens'; break
            case 'refusal': r.stop = 'refusal'; break
            case 'pause_turn': r.stop = 'pause_turn'; break
            default: r.stop = r.rawStop
          }
          const content = blocks.filter(Boolean)
          if (r.stop === 'tool_use' || r.stop === 'pause_turn') {
            // The assistant turn goes back unchanged, thinking blocks included.
            messages.push({ role: 'assistant', content })
          }
          if (r.stop === 'tool_use') {
            for (const b of content) if (b.type === 'tool_use') r.toolCalls.push({ id: String(b.id), name: String(b.name), args: JSON.stringify(b.input ?? {}) })
          }
          return r
        },
        addToolResults(results) {
          messages.push({ role: 'user', content: results.map((x) => ({ type: 'tool_result', tool_use_id: x.id, content: x.content, ...(x.isError ? { is_error: true } : {}) })) })
        },
      }
    },
  }
}

// ------------------------------------------------------------------ Chat Completions

export function chatProvider(setup: DeviceSetup, f: Fetch = fetch): Provider {
  return {
    start(req) {
      const messages: Record<string, unknown>[] = [{ role: 'system', content: req.system }, ...req.messages.filter((m) => m.text).map((m) => ({ role: m.role, content: m.text }))]
      const tools = req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: setup.provider === 'gemini' ? t.strict_nullable_schema : t.input_schema } }))
      return {
        async next(onText, signal) {
          const body: Record<string, unknown> = { model: setup.model, messages, stream: true, stream_options: { include_usage: true } }
          if (tools.length) { body.tools = tools; body.tool_choice = 'auto' }
          body[setup.provider === 'openai' ? 'max_completion_tokens' : 'max_tokens'] = req.maxTokens
          const headers: Record<string, string> = {}
          if (setup.key) headers.authorization = `Bearer ${setup.key}`
          const res = await post(f, setup.provider, baseUrlOf(setup) + '/chat/completions', headers, body, signal)
          const calls: { id: string; name: string; args: string }[] = []
          let text = ''
          let finish = ''
          const r: Round = { stop: '', rawStop: '', toolCalls: [], input: 0, output: 0 }
          for await (const ev of sseEvents(res.body!)) {
            if (ev.data === '[DONE]') break
            let chunk: Record<string, any>
            try { chunk = JSON.parse(ev.data) } catch { throw new ProviderError('provider_error', 'the provider sent a stream this device could not read') }
            if (chunk.error) throw new ProviderError('provider_error', 'the provider reported an error while answering')
            if (chunk.usage) { r.input = chunk.usage.prompt_tokens ?? 0; r.output = chunk.usage.completion_tokens ?? 0 }
            for (const ch of chunk.choices ?? []) {
              const content = ch.delta?.content
              if (typeof content === 'string' && content) { text += content; onText(content) }
              for (const tc of ch.delta?.tool_calls ?? []) {
                let i = calls.length
                if (typeof tc.index === 'number') i = tc.index
                else if (!tc.id && calls.length) i = calls.length - 1
                if (i < 0 || i > 128) throw new ProviderError('provider_error', 'the provider sent too many tool calls')
                while (calls.length <= i) calls.push({ id: '', name: '', args: '' })
                if (tc.id) calls[i].id = tc.id
                if (tc.function?.name) calls[i].name = tc.function.name
                calls[i].args += tc.function?.arguments ?? ''
              }
              if (ch.finish_reason) finish = ch.finish_reason
            }
          }
          r.rawStop = finish
          switch (finish) {
            case 'stop': r.stop = 'end_turn'; break
            case 'tool_calls': case 'function_call': r.stop = 'tool_use'; break
            case 'length': r.stop = 'max_tokens'; break
            case 'content_filter': r.stop = 'refusal'; break
            case '': r.stop = calls.length ? 'tool_use' : 'end_turn'; break
            default: r.stop = finish
          }
          if (r.stop === 'end_turn' && calls.length) r.stop = 'tool_use'
          if (r.stop === 'tool_use') {
            const tcs = calls.map((c, i) => {
              const id = c.id || `call_${i}`
              const args = c.args.trim() ? c.args : '{}'
              r.toolCalls.push({ id, name: c.name, args })
              return { id, type: 'function', function: { name: c.name, arguments: args } }
            })
            messages.push({ role: 'assistant', tool_calls: tcs, content: text || null })
          }
          return r
        },
        addToolResults(results) {
          // The wire format has no error flag: say it in the content.
          for (const x of results) messages.push({ role: 'tool', tool_call_id: x.id, content: x.isError ? 'ERROR: ' + x.content : x.content })
        },
      }
    },
  }
}

export function providerFor(setup: DeviceSetup, f: Fetch = fetch): Provider {
  return setup.provider === 'anthropic' ? anthropicProvider(setup, f) : chatProvider(setup, f)
}

/**
 * "Test connection" from the device: one minimal request with one tool. Only a
 * plain refusal (provider_error, 4xx other than 404) is tried again without the
 * tool, to tell missing tool support apart (Service.test in Go); a rejected key
 * or a missing model sends one request.
 */
export async function testConnection(setup: DeviceSetup, f: Fetch = fetch, signal?: AbortSignal): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const tool = manifest.tools.find((t) => t.name === 'today_summary')!
  const run = async (tools: ManifestTool[]) => {
    const conv = providerFor(setup, f).start({ system: 'Connection test. Answer with the word OK.', messages: [{ role: 'user', text: 'Say OK.' }], tools, maxTokens: 512 })
    await conv.next(() => {}, signal)
  }
  try {
    await run([tool])
    return { ok: true }
  } catch (err) {
    if (!(err instanceof ProviderError)) throw err
    if (err.code === 'provider_error' && err.status >= 400 && err.status < 500 && err.status !== 404) {
      const plain = await run([]).then(() => true, () => false)
      if (plain) return { ok: false, code: 'no_tool_support', message: 'the provider answers, but it rejects tool definitions: this model does not support tool use, which the assistant needs' }
    }
    return { ok: false, code: err.code, message: err.message }
  }
}
