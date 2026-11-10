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
//   "… plan my day …"           → today_summary → show_tasks → show_calendar → a short answer (assistant-generative-ui)
//   "… in progress …"           → list_projects → show_board(the "In progress" section) → a short answer
//   "… errands …"               → search_tasks("errands") → show_map → suggest_followups → words only if asked for
//   "… don't see any map …"     → an apology in words, no tool
//   "what do I have to do …"    → today_summary → a lead-in with show_tasks(the one task) → its link once refused
//                                 (the last four: the eval's assistant-eval-gaps scenarios)
//   anything else              → today_summary → a list of what is due
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
      // A tool call, optionally after some text in the same round (as real models do).
      const tool = (name, args, before = '') => {
        if (before) send({ choices: [{ index: 0, delta: { content: before } }] })
        send({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: `call_${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] })
        finish('tool_calls')
      }
      // An answer with no words: the round ends without text.
      const silent = () => finish('stop')
      reply(body, { text, tool, silent })
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

function reply(body, { text, tool, silent }) {
  const msgs = body.messages ?? []
  const system = msgs.find((m) => m.role === 'system')?.content ?? ''
  if (system.startsWith('Connection test')) return text('OK')
  const { date, zone } = today(system)
  const question = lastUser(msgs).toLowerCase()
  const toolMsgs = msgs.filter((m) => m.role === 'tool')
  const last = msgs[msgs.length - 1]
  const lastCall = [...msgs].reverse().find((m) => m.role === 'assistant' && m.tool_calls)?.tool_calls?.[0]?.function?.name
  const result = last?.role === 'tool' ? safeJSON(last.content) : null
  const fresh = toolMsgs.length === 0 || last.role !== 'tool'
  if (evalGaps({ question, fresh, lastCall, result, zone }, { text, tool, silent })) return
  const reschedule = /overdue|friday|move|reschedule/.test(question)
  if (fresh) {
    return reschedule ? tool('list_tasks', { view: 'today', timezone: zone }) : tool('today_summary', { timezone: zone })
  }
  // Write tools on request (assistant-lean-tools): ask for them first when only propose_changes is offered.
  const offered = new Set((body.tools ?? []).map((t) => t.function?.name))
  if (lastCall === 'list_tasks' && offered.has('propose_changes') && !offered.has('schedule_tasks')) return tool('propose_changes', {})
  if (lastCall === 'list_tasks' || lastCall === 'propose_changes') {
    const listed = lastCall === 'list_tasks' ? result : safeJSON(toolMsgs[0]?.content)
    const tasks = listed?.tasks ?? []
    let ids = tasks.filter((t) => t.overdue).map((t) => t.id)
    if (ids.length === 0) ids = tasks.map((t) => t.id)
    if (ids.length === 0) return text('Nothing is overdue or due today, so there is nothing to move.')
    return tool('schedule_tasks', { ids: ids.slice(0, 50), due: { date: nextFriday(date) } })
  }
  if (lastCall === 'schedule_tasks') {
    const n = result?.results?.length ?? 0
    return text(`I've proposed moving ${n} task${n === 1 ? '' : 's'} to ${words(nextFriday(date))}. Review the changes below; nothing changes until you apply them.`)
  }
  // Blocks (assistant-generative-ui): the day's tasks, then the day as planned.
  const planDay = /plan my day/.test(question)
  if (planDay && lastCall === 'today_summary') {
    const ids = [...(result?.overdue ?? []), ...(result?.due_today ?? [])].map((t) => t.id).slice(0, 20)
    if (ids.length === 0) return text('Nothing is due today, so there is nothing to plan.')
    return tool('show_tasks', { ids, title: 'On your plate today' })
  }
  if (planDay && lastCall === 'show_tasks') return tool('show_calendar', { date, span: 'day' })
  if (planDay && lastCall === 'show_calendar') return text('That is the day as it stands. Start with the overdue ones; I can move the rest to tomorrow if the day is too full.')
  if (lastCall === 'today_summary') {
    const items = [...(result?.overdue ?? []), ...(result?.due_today ?? [])]
    if (items.length === 0) return text('Nothing is due today. Enjoy the free time.')
    const list = items.map((t) => `- ${t.untrusted_text?.title ?? 'A task'}${t.overdue ? ' (overdue)' : ''}`).join('\n')
    return text(`You have ${items.length} task${items.length === 1 ? '' : 's'} for today:\n\n${list}\n\nWant me to move the overdue ones to Friday?`)
  }
  return text('Done.')
}

// The paths of the eval scenarios a real model failed on (assistant-eval-gaps),
// scripted the way that model went, so the server's fixes are what makes them
// pass. Returns true when it answered.
function evalGaps({ question, fresh, lastCall, result, zone }, { text, tool, silent }) {
  // board-column: the project's sections come with list_projects, so the column is named.
  if (/in progress/.test(question)) {
    if (fresh) return tool('list_projects', {}), true
    if (lastCall === 'list_projects') {
      const p = (result?.projects ?? []).find((x) => (x.sections ?? []).some((s) => /in progress/i.test(s.untrusted_text?.name ?? '')))
      if (!p) return text('Sections are unknown, so here is the whole board.'), true
      const s = p.sections.find((x) => /in progress/i.test(x.untrusted_text?.name ?? ''))
      return tool('show_board', { id: p.id, section_id: s.id }), true
    }
    if (lastCall === 'show_board') return text('Those are the cards in progress.'), true
    return false
  }
  // errands-map and complaint-no-repeat: the search says "errands", the label is "errand".
  if (/don't see any map|no map/.test(question)) {
    return text('Sorry about that. The places may lack coordinates, or maps may be turned off on this server. I can list the errands with their addresses instead.'), true
  }
  if (/errands/.test(question)) {
    if (fresh) return tool('search_tasks', { query: 'errands', timezone: zone }), true
    if (lastCall === 'search_tasks') {
      const ids = (result?.tasks ?? []).filter((t) => t.location?.lat !== undefined).map((t) => t.id)
      // The model the eval caught answered with only follow-ups when the search found nothing.
      if (ids.length === 0) return tool('suggest_followups', { suggestions: ['Add an errand'] }), true
      return tool('show_map', { task_ids: ids }), true
    }
    if (lastCall === 'show_map') return tool('suggest_followups', { suggestions: ['Plan a route'] }), true
    // Words only when the result asks for them: a model that ignores it would end silent.
    if (lastCall === 'suggest_followups') return /no words yet/.test(result?.message ?? '') ? text('Your errands with a place are below.') : silent(), true
    return false
  }
  // one-task-link: the model wrote a lead-in and showed the one task as a block.
  if (/what do i have to do/.test(question)) {
    if (fresh) return tool('today_summary', { timezone: zone }), true
    if (lastCall === 'today_summary') {
      const items = [...(result?.overdue ?? []), ...(result?.due_today ?? [])]
      if (items.length !== 1) return false
      return tool('show_tasks', { ids: [items[0].id] }, 'Today you only have one task:'), true
    }
    if (lastCall === 'show_tasks') {
      if (result?.error === 'one_task') return text(`[Your one task](?task=${result.id}) is all; nothing else is due.`), true
      return text('That is all for today.'), true
    }
    return false
  }
  return false
}

function safeJSON(s) {
  try { return JSON.parse(String(s).replace(/^ERROR: /, '')) } catch { return null }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[2] ?? 18099)
  await startFakeLLM(port)
  console.log(`fake model provider on http://127.0.0.1:${port}/v1`)
}
