import { describe, expect, it } from 'vitest'
import { manifest } from './manifest'
import { anthropicProvider, chatProvider, deviceCode, ProviderError, sseEvents, testConnection, type Fetch } from './providers'
import vectors from './errors.vectors.json'
import { checkSetup, originOf, baseUrlOf, ENDPOINTS } from './settings'

function sse(events: unknown[], named = true): string {
  return events.map((e) => (named ? `event: ${(e as { type: string }).type}\n` : '') + `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join('')
}

/** A fetch that answers with a stream split into small chunks and records requests. */
function fakeFetch(bodies: string[], status = 200) {
  const calls: { url: string; init: RequestInit }[] = []
  const f: Fetch = async (url, init) => {
    calls.push({ url: String(url), init: init! })
    const text = bodies[calls.length - 1] ?? ''
    const enc = new TextEncoder().encode(text)
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < enc.length; i += 9) c.enqueue(enc.slice(i, i + 9))
        c.close()
      },
    })
    return new Response(stream, { status })
  }
  return { f, calls }
}

const tool = manifest.tools.find((t) => t.name === 'complete_tasks')!

describe('sseEvents', () => {
  it('reads events split across chunks and CRLF lines', async () => {
    const { f } = fakeFetch(['event: a\r\ndata: 1\r\n\r\ndata: 2\n\n'])
    const out = []
    for await (const e of sseEvents((await f('x')).body!)) out.push(e)
    expect(out).toEqual([{ event: 'a', data: '1' }, { event: 'message', data: '2' }])
  })
})

describe('Anthropic from the browser', () => {
  const setup = { provider: 'anthropic' as const, model: 'claude-opus-5-5', key: 'sk-ant-test', savedAt: 1 }

  it('streams text, collects a tool call and sends the thinking block back unchanged', async () => {
    const round1 = sse([
      { type: 'message_start', message: { usage: { input_tokens: 100, cache_read_input_tokens: 20, output_tokens: 1 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Let me check.' } },
      { type: 'content_block_stop', index: 1 },
      { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'tu1', name: 'complete_tasks', input: {} } },
      { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"ids":' } },
      { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '["a"]}' } },
      { type: 'content_block_stop', index: 2 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 42 } },
      { type: 'message_stop' },
    ])
    const round2 = sse([{ type: 'message_start', message: { usage: { input_tokens: 5, output_tokens: 1 } } }, { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } }])
    const { f, calls } = fakeFetch([round1, round2])
    const conv = anthropicProvider(setup, f).start({ system: 'S', messages: [{ role: 'assistant', text: 'skip' }, { role: 'user', text: 'Q' }], tools: [tool], maxTokens: 8192 })
    const texts: string[] = []
    const r = await conv.next((t) => texts.push(t))
    expect(r).toMatchObject({ stop: 'tool_use', input: 120, output: 42, toolCalls: [{ id: 'tu1', name: 'complete_tasks', args: '{"ids":["a"]}' }] })
    expect(texts).toEqual(['Let me check.'])
    expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages')
    const h = calls[0].init.headers as Record<string, string>
    expect(h['x-api-key']).toBe('sk-ant-test')
    expect(h['anthropic-dangerous-direct-browser-access']).toBe('true')
    expect(calls[0].init.credentials).toBe('omit')
    const body = JSON.parse(String(calls[0].init.body))
    expect(body).toMatchObject({ model: 'claude-opus-5-5', thinking: { type: 'adaptive' }, tool_choice: { type: 'auto' }, stream: true, messages: [{ role: 'user' }] })
    expect(body.tools[0]).toMatchObject({ name: 'complete_tasks', strict: true, input_schema: tool.strict_schema })
    conv.addToolResults([{ id: 'tu1', content: '{"ok":true}', isError: false }])
    expect((await conv.next(() => {})).stop).toBe('end_turn')
    const second = JSON.parse(String(calls[1].init.body))
    expect(second.messages[1]).toEqual({ role: 'assistant', content: [
      { type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: 'Let me check.' }, { type: 'tool_use', id: 'tu1', name: 'complete_tasks', input: { ids: ['a'] } },
    ] })
    expect(second.messages[2]).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: '{"ok":true}' }] })
  })

  it('maps a rejected key without repeating it', async () => {
    const { f } = fakeFetch(['{"type":"error"}'], 401)
    const err = await anthropicProvider(setup, f).start({ system: '', messages: [], tools: [], maxTokens: 10 }).next(() => {}).catch((e) => e)
    expect(err).toBeInstanceOf(ProviderError)
    expect(err.code).toBe('provider_auth')
    expect(err.message).not.toContain('sk-ant-test')
  })

  it('says when the page or the provider blocked the request', async () => {
    const f: Fetch = async () => { throw new TypeError('Failed to fetch') }
    expect(await testConnection(setup, f)).toMatchObject({ ok: false, code: 'blocked' })
  })
})

describe('Chat Completions from the browser', () => {
  it('assembles streamed tool calls for a model server without a key', async () => {
    const setup = { provider: 'compatible' as const, model: 'llama3.2', baseUrl: 'http://localhost:11434/v1/', savedAt: 1 }
    const body = sse([
      { choices: [{ delta: { content: 'Hi' } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'x', function: { name: 'complete_tasks', arguments: '{"ids"' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ':["a"]}' } }] }, finish_reason: 'tool_calls' }] },
      { choices: [], usage: { prompt_tokens: 7, completion_tokens: 3 } },
      '[DONE]',
    ], false)
    const { f, calls } = fakeFetch([body])
    const conv = chatProvider(setup, f).start({ system: 'S', messages: [{ role: 'user', text: 'Q' }], tools: [tool], maxTokens: 100 })
    const r = await conv.next(() => {})
    expect(r).toMatchObject({ stop: 'tool_use', input: 7, output: 3, toolCalls: [{ id: 'x', name: 'complete_tasks', args: '{"ids":["a"]}' }] })
    expect(calls[0].url).toBe('http://localhost:11434/v1/chat/completions')
    expect((calls[0].init.headers as Record<string, string>).authorization).toBeUndefined()
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ max_tokens: 100, tool_choice: 'auto', stream_options: { include_usage: true } })
  })

  it('sends OpenAI a bearer key and Gemini schemas without type lists', async () => {
    const done = sse([{ choices: [{ delta: {}, finish_reason: 'stop' }] }, '[DONE]'], false)
    const { f, calls } = fakeFetch([done, done])
    await chatProvider({ provider: 'openai', model: 'gpt-x', key: 'sk-o', savedAt: 1 }, f).start({ system: '', messages: [], tools: [tool], maxTokens: 9 }).next(() => {})
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer sk-o')
    expect(JSON.parse(String(calls[0].init.body)).max_completion_tokens).toBe(9)
    const update = manifest.tools.find((t) => t.name === 'update_tasks')!
    await chatProvider({ provider: 'gemini', model: 'gemini-x', key: 'g', savedAt: 1 }, f).start({ system: '', messages: [], tools: [update], maxTokens: 9 }).next(() => {})
    expect(calls[1].url).toBe(manifest.endpoints.gemini + '/chat/completions')
    expect(String(calls[1].init.body)).not.toContain('["string","null"]')
  })
})

describe('device setup checks', () => {
  const allowed = { providers: ['anthropic', 'compatible'], origins: ['http://localhost:11434'], anthropic_models: manifest.anthropic_models }
  it('knows the manifest endpoints', () => {
    expect(ENDPOINTS).toEqual(manifest.endpoints)
  })
  it('accepts allowed providers and model server origins only', () => {
    expect(checkSetup({ provider: 'anthropic', model: 'claude-opus-5-5', key: 'k' }, allowed)).toBeNull()
    expect(checkSetup({ provider: 'anthropic', model: 'claude-opus-5-5' }, allowed)).toBe('key')
    expect(checkSetup({ provider: 'anthropic', model: 'gpt' , key: 'k' }, allowed)).toBe('model')
    expect(checkSetup({ provider: 'openai', model: 'gpt', key: 'k' }, allowed)).toBe('provider')
    expect(checkSetup({ provider: 'compatible', model: 'llama3.2', baseUrl: 'http://localhost:11434/v1' }, allowed)).toBeNull()
    expect(checkSetup({ provider: 'compatible', model: 'llama3.2', baseUrl: 'http://localhost:1234/v1' }, allowed)).toBe('origin')
    expect(checkSetup({ provider: 'compatible', model: 'llama3.2', baseUrl: 'ftp://x' }, allowed)).toBe('base_url')
  })
  it('names origins and base URLs', () => {
    expect(originOf('HTTPS://Models.Example.com:8443/v1')).toBe('https://models.example.com:8443')
    expect(baseUrlOf({ provider: 'openai' })).toBe('https://api.openai.com/v1')
  })
})

describe('provider errors (shared vectors with internal/assistant)', () => {
  it.each(vectors.map((v) => [v.name, v] as const))('%s', async (_, v) => {
    const setup = { provider: v.provider as 'openai' | 'gemini' | 'compatible', model: 'm', key: 'k-SECRET', baseUrl: 'http://localhost:11434/v1', savedAt: 1 }
    const { f } = fakeFetch([v.body], v.status)
    const err = await chatProvider(setup, f).start({ system: '', messages: [], tools: [], maxTokens: 9 }).next(() => {}).catch((e) => e)
    expect(err).toBeInstanceOf(ProviderError)
    expect({ code: err.code, type: err.type, status: err.status }).toEqual({ code: v.code, type: v.type, status: v.status })
    expect(err.message.includes('/v1')).toBe(v.hint)
    for (const leak of ['Please pass', 'Incorrect API key', 'sk-abc', 'is not found', 'slow down', 'k-SECRET']) expect(err.message).not.toContain(leak)
  })

  it('reads a long error body only in part', async () => {
    const body = `{"error":{"type":"invalid_request_error","message":"${'x'.repeat(10_000)}"}}`
    const { f } = fakeFetch([body], 400)
    const err = await chatProvider({ provider: 'openai', model: 'm', key: 'k', savedAt: 1 }, f).start({ system: '', messages: [], tools: [], maxTokens: 9 }).next(() => {}).catch((e) => e)
    expect(err).toMatchObject({ code: 'provider_error', type: '' })
  })
})

describe('test connection from the device', () => {
  const gemini = { provider: 'gemini' as const, model: 'gemini-x', key: 'bad', savedAt: 1 }
  const badKey = vectors.find((v) => v.code === 'provider_auth' && v.provider === 'gemini')!
  const notFound = vectors.find((v) => v.code === 'provider_not_found' && v.provider === 'gemini')!

  it('sends one request for a rejected key or a missing model', async () => {
    for (const v of [badKey, notFound]) {
      const { f, calls } = fakeFetch([v.body, v.body], v.status)
      expect(await testConnection(gemini, f)).toMatchObject({ ok: false, code: v.code })
      expect(calls).toHaveLength(1)
    }
  })

  it('tries again without tools after a plain refusal', async () => {
    const calls: string[] = []
    const f: Fetch = async (_url, init) => {
      const body = String(init!.body)
      calls.push(body)
      if (body.includes('"tools"')) return new Response('{"error":{"type":"invalid_request_error"}}', { status: 400 })
      return new Response(sse([{ choices: [{ delta: { content: 'OK' }, finish_reason: 'stop' }] }, '[DONE]'], false), { status: 200 })
    }
    expect(await testConnection({ provider: 'compatible', model: 'm', baseUrl: 'http://localhost:11434/v1', savedAt: 1 }, f)).toMatchObject({ ok: false, code: 'no_tool_support' })
    expect(calls).toHaveLength(2)
  })

  it('maps device failures to the panel codes', () => {
    expect(['provider_auth', 'provider_not_found', 'no_tool_support', 'blocked', 'provider_error'].map(deviceCode))
      .toEqual(['device_auth', 'device_not_found', 'device_no_tool_support', 'device_blocked', 'provider_error'])
  })
})

describe('model server address', () => {
  it('trims a pasted request path once', async () => {
    expect(baseUrlOf({ provider: 'compatible', baseUrl: 'https://openrouter.ai/api/v1/chat/completions/' })).toBe('https://openrouter.ai/api/v1')
    expect(baseUrlOf({ provider: 'compatible', baseUrl: 'http://192.168.1.20:11434/v1' })).toBe('http://192.168.1.20:11434/v1')
    expect(baseUrlOf({ provider: 'compatible', baseUrl: 'http://localhost:11434/v1/' })).toBe('http://localhost:11434/v1')
    const { f, calls } = fakeFetch([sse([{ choices: [{ delta: {}, finish_reason: 'stop' }] }, '[DONE]'], false)])
    await chatProvider({ provider: 'compatible', model: 'm', baseUrl: 'http://localhost:11434/v1/chat/completions', savedAt: 1 }, f).start({ system: '', messages: [], tools: [], maxTokens: 9 }).next(() => {})
    expect(calls[0].url).toBe('http://localhost:11434/v1/chat/completions')
  })
})
