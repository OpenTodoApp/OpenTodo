// A deterministic stand-in for a model provider (OpenSpec change
// `in-app-assistant`): a tiny OpenAI-compatible Chat Completions server that
// streams scripted answers and tool calls. The layout check, the docs
// screenshots and manual runs point the assistant's "compatible endpoint" at
// it (with private endpoints allowed), so no real provider or key is ever used.
//
//   node scripts/fake-llm.mjs [port]          (default 18099; base URL http://127.0.0.1:<port>/v1)
//
// Script:
//   "… overdue … / … Friday …"  → list_tasks(today) → schedule_tasks(overdue or due today → next Friday) → a short answer
//   anything else               → today_summary → a list of what is due
// It also answers the connection test (one tool, "Reply with OK").
import { createServer } from 'node:http'

export function startFakeLLM(port = 18099, host = '127.0.0.1') {
  const server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => { raw += c })
    req.on('end', () => {
      if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end('{"error":{"type":"not_found"}}')
        return
      }
      let body
      try { body = JSON.parse(raw) } catch { res.writeHead(400); res.end(); return }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' })
      const send = (v) => res.write(`data: ${JSON.stringify(v)}\n\n`)
      const finish = (reason, prompt = 900, completion = 120) => {
        send({ choices: [{ index: 0, delta: {}, finish_reason: reason }] })
        send({ choices: [], usage: { prompt_tokens: prompt, completion_tokens: completion } })
        res.end('data: [DONE]\n\n')
      }
      const text = (t) => {
        for (const part of t.split(/(?<= )/)) send({ choices: [{ index: 0, delta: { content: part } }] })
        finish('stop')
      }
      const tool = (name, args) => {
        send({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: `call_${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] })
        finish('tool_calls')
      }
      reply(body, { text, tool })
    })
  })
  return new Promise((resolve) => server.listen(port, host, () => resolve(server)))
}

function lastUser(messages) {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') return String(messages[i].content ?? '')
  return ''
}

function today(system) {
  const m = /(\d{4}-\d{2}-\d{2}), in the user's time zone ([^\s.]+)/.exec(system ?? '')
  return { date: m ? m[1] : new Date().toISOString().slice(0, 10), zone: m ? m[2] : 'UTC' }
}

function nextFriday(date) {
  const d = new Date(date + 'T12:00:00Z')
  do d.setUTCDate(d.getUTCDate() + 1)
  while (d.getUTCDay() !== 5)
  return d.toISOString().slice(0, 10)
}

const words = (date) => new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

function reply(body, { text, tool }) {
  const msgs = body.messages ?? []
  const system = msgs.find((m) => m.role === 'system')?.content ?? ''
  if (system.startsWith('Connection test')) return text('OK')
  const { date, zone } = today(system)
  const question = lastUser(msgs).toLowerCase()
  const toolMsgs = msgs.filter((m) => m.role === 'tool')
  const last = msgs[msgs.length - 1]
  const lastCall = [...msgs].reverse().find((m) => m.role === 'assistant' && m.tool_calls)?.tool_calls?.[0]?.function?.name
  const result = last?.role === 'tool' ? safeJSON(last.content) : null
  const reschedule = /overdue|friday|move|reschedule/.test(question)
  if (toolMsgs.length === 0 || last.role !== 'tool') {
    return reschedule ? tool('list_tasks', { view: 'today', timezone: zone }) : tool('today_summary', { timezone: zone })
  }
  if (lastCall === 'list_tasks') {
    const tasks = result?.tasks ?? []
    let ids = tasks.filter((t) => t.overdue).map((t) => t.id)
    if (ids.length === 0) ids = tasks.map((t) => t.id)
    if (ids.length === 0) return text('Nothing is overdue or due today, so there is nothing to move.')
    return tool('schedule_tasks', { ids: ids.slice(0, 50), due: { date: nextFriday(date) } })
  }
  if (lastCall === 'schedule_tasks') {
    const n = result?.results?.length ?? 0
    return text(`I've proposed moving ${n} task${n === 1 ? '' : 's'} to ${words(nextFriday(date))}. Review the changes below; nothing changes until you apply them.`)
  }
  if (lastCall === 'today_summary') {
    const items = [...(result?.overdue ?? []), ...(result?.due_today ?? [])]
    if (items.length === 0) return text('Nothing is due today. Enjoy the free time.')
    const list = items.map((t) => `- ${t.untrusted_text?.title ?? 'A task'}${t.overdue ? ' (overdue)' : ''}`).join('\n')
    return text(`You have ${items.length} task${items.length === 1 ? '' : 's'} for today:\n\n${list}\n\nWant me to move the overdue ones to Friday?`)
  }
  return text('Done.')
}

function safeJSON(s) {
  try { return JSON.parse(String(s).replace(/^ERROR: /, '')) } catch { return null }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[2] ?? 18099)
  await startFakeLLM(port)
  console.log(`fake model provider on http://127.0.0.1:${port}/v1`)
}
