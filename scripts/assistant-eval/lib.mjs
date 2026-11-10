// The assistant eval's pure part (OpenSpec change assistant-eval): scenario
// checking, the turn stream's events, the expectation checks, majority voting
// and the report. No network, no server: run.mjs does that, and the tests
// (lib.test.mjs) drive this on recorded events.

// Display tools and the block kind each streams (internal/assistant/blocks.go).
export const DISPLAY_TOOLS = { show_tasks: 'tasks', show_calendar: 'calendar', show_map: 'map', show_note: 'note', show_project: 'project', ask_choice: 'choice', show_time: 'time', show_free_time: 'free_time', show_deadlines: 'deadlines',
  show_board: 'board', show_timeline: 'timeline', show_activity: 'activity', show_stats: 'stats', show_task: 'task', show_habit: 'habit' }
const KINDS = new Set(Object.values(DISPLAY_TOOLS))
const EXPECT_KEYS = new Set(['blocks', 'no_tools', 'no_text', 'text', 'links', 'changeset', 'changes', 'never_ids', 'no_map_claim'])
const BLOCK_KEYS = new Set(['kind', 'ids', 'ids_include', 'min_ids', 'date', 'span', 'min_options', 'to', 'group_by', 'section', 'of'])
const CHANGE_KEYS = new Set(['entity', 'ids', 'fields', 'create', 'min'])

// A text that says a map is there (proposal: "no claim that a map appeared").
export const MAP_CLAIM = /\b(?:map (?:above|below)|(?:above|below)[^.\n]{0,40}\bmap\b|(?:on|in) the map(?: above| below)?[^.\n]{0,20}\b(?:you can see|shown|marked)|(?:I(?:'ve| have)|here(?:'s| is)) (?:shown|drawn|put|plotted|placed|added)[^.\n]{0,40}\bmap\b|\bhere(?:'s| is) (?:a|the|your) map\b|\b(?:shown|plotted|marked|pinned) (?:them |it |these |those )?on (?:a|the) map)/i

/**
 * Checks a scenario file's content and returns the problems found (empty when
 * it is valid). Seed keys must be unique, and every key an expectation names
 * must be one the seed defines.
 */
export function validateScenario(s, file = 'scenario') {
  const out = []
  const bad = (m) => out.push(`${file}: ${m}`)
  if (!s || typeof s !== 'object') return [`${file}: not an object`]
  if (typeof s.name !== 'string' || !/^[a-z0-9-]+$/.test(s.name)) bad('name: lowercase letters, digits and dashes')
  if (typeof s.title !== 'string' || !s.title) bad('title: a sentence')
  if (s.fake !== undefined && typeof s.fake !== 'boolean') bad('fake: true or false')
  const seed = s.seed ?? {}
  const keys = new Map()
  for (const kind of ['labels', 'projects', 'sections', 'tasks', 'notes']) {
    const list = seed[kind] ?? []
    if (!Array.isArray(list)) { bad(`seed.${kind}: a list`); continue }
    for (const [i, it] of list.entries()) {
      if (typeof it?.key !== 'string' || !it.key) bad(`seed.${kind}[${i}]: a key`)
      else if (keys.has(it.key)) bad(`seed.${kind}[${i}]: key "${it.key}" used twice`)
      else keys.set(it.key, kind)
      const named = kind === 'labels' || kind === 'projects' || kind === 'sections'
      const name = named ? it?.name : it?.title
      if (typeof name !== 'string' || !name) bad(`seed.${kind}[${i}]: ${named ? 'name' : 'title'}`)
      if (it?.due !== undefined && !Number.isInteger(it.due)) bad(`seed.${kind}[${i}].due: whole days from today`)
    }
  }
  const ref = (where, key, kinds) => {
    if (!keys.has(key)) bad(`${where}: unknown seed key "${key}"`)
    else if (kinds && !kinds.includes(keys.get(key))) bad(`${where}: "${key}" is not one of ${kinds.join(', ')}`)
  }
  for (const [i, t] of (seed.tasks ?? []).entries()) {
    if (t.project) ref(`seed.tasks[${i}].project`, t.project, ['projects'])
    if (t.section) ref(`seed.tasks[${i}].section`, t.section, ['sections'])
    for (const l of t.labels ?? []) ref(`seed.tasks[${i}].labels`, l, ['labels'])
  }
  for (const [i, n] of (seed.notes ?? []).entries()) if (n.project) ref(`seed.notes[${i}].project`, n.project, ['projects'])
  for (const [i, p] of (seed.projects ?? []).entries()) if (p.parent) ref(`seed.projects[${i}].parent`, p.parent, ['projects'])
  for (const [i, sec] of (seed.sections ?? []).entries()) ref(`seed.sections[${i}].project`, sec.project, ['projects'])
  if (s.view !== undefined && typeof s.view !== 'string') bad('view: the view the user asks from')
  if (!Array.isArray(s.turns) || s.turns.length === 0) { bad('turns: at least one'); return out }
  for (const [i, turn] of s.turns.entries()) {
    const at = `turns[${i}]`
    if (typeof turn?.say !== 'string' || !turn.say) bad(`${at}.say: the user's message`)
    const e = turn?.expect
    if (!e || typeof e !== 'object') { bad(`${at}.expect: an object`); continue }
    for (const k of Object.keys(e)) if (!EXPECT_KEYS.has(k)) bad(`${at}.expect.${k}: unknown expectation`)
    for (const [j, b] of (e.blocks ?? []).entries()) {
      for (const k of Object.keys(b)) if (!BLOCK_KEYS.has(k)) bad(`${at}.expect.blocks[${j}].${k}: unknown`)
      if (!KINDS.has(b.kind)) bad(`${at}.expect.blocks[${j}].kind: one of ${[...KINDS].join(', ')}`)
      for (const id of [...(b.ids ?? []), ...(b.ids_include ?? [])]) ref(`${at}.expect.blocks[${j}]`, id)
      if (b.section) ref(`${at}.expect.blocks[${j}].section`, b.section, ['sections'])
    }
    for (const n of e.no_tools ?? []) if (!(n in DISPLAY_TOOLS)) bad(`${at}.expect.no_tools: "${n}" is not a display tool (writes are "changeset": false)`)
    for (const k of ['no_text', 'text']) for (const p of e[k] ?? []) { try { new RegExp(p, 'i') } catch { bad(`${at}.expect.${k}: bad pattern ${p}`) } }
    for (const id of e.links ?? []) ref(`${at}.expect.links`, id, ['tasks'])
    for (const id of e.never_ids ?? []) ref(`${at}.expect.never_ids`, id)
    if (e.changeset !== undefined && typeof e.changeset !== 'boolean') bad(`${at}.expect.changeset: true or false`)
    if (e.changes && e.changeset === false) bad(`${at}.expect.changes: contradicts "changeset": false`)
    for (const [j, c] of (e.changes ?? []).entries()) {
      for (const k of Object.keys(c)) if (!CHANGE_KEYS.has(k)) bad(`${at}.expect.changes[${j}].${k}: unknown`)
      for (const id of c.ids ?? []) ref(`${at}.expect.changes[${j}]`, id)
    }
  }
  return out
}

/** Parses a server-sent events body into [{name, data}]. */
export function parseEvents(body) {
  const out = []
  for (const chunk of String(body).split(/\n\n+/)) {
    let name = 'message'
    const data = []
    for (const line of chunk.split('\n')) {
      if (line.startsWith('event:')) name = line.slice(6).trim()
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
    }
    if (!data.length) continue
    let d
    try { d = JSON.parse(data.join('\n')) } catch { d = data.join('\n') }
    out.push({ name, data: d })
  }
  return out
}

/** A turn's events summed up: the answer's text, its blocks, changes, status lines, usage and stop. */
export function summarize(events) {
  const s = { text: '', blocks: [], changes: [], status: [], usage: null, stop: '', error: null }
  for (const { name, data } of events) {
    if (name === 'text') s.text += data.text ?? ''
    else if (name === 'block') s.blocks.push(data)
    else if (name === 'status') s.status.push(data.text)
    else if (name === 'changeset') s.changes.push(...(data.items ?? []))
    else if (name === 'usage') s.usage = data
    else if (name === 'done') s.stop = data.stop_reason ?? ''
    else if (name === 'error') s.error = `${data.code}: ${data.message}`
  }
  return s
}

const blockIds = (b) => [...(b.ids ?? []), ...(b.task_ids ?? []), ...(b.place_ids ?? []), ...(b.id ? [b.id] : [])]
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x))
const day = (offset, today) => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10) }

/**
 * Checks one turn's summary against its expectations and returns the failed
 * ones as sentences (empty when it passes). ids maps seed keys to real ids;
 * today is the UTC date relative dates count from.
 */
export function checkTurn(expect, sum, ids = {}, today = new Date().toISOString().slice(0, 10)) {
  const fail = []
  const id = (k) => ids[k] ?? k
  const names = Object.fromEntries(Object.entries(ids).map(([k, v]) => [v, k]))
  const show = (list) => `[${list.map((x) => names[x] ?? x).join(', ')}]`
  if (sum.error) fail.push(`the turn ended with an error (${sum.error})`)
  for (const want of expect.blocks ?? []) {
    const ofKind = sum.blocks.filter((b) => b.kind === want.kind)
    const match = ofKind.find((b) => {
      const got = blockIds(b)
      if (want.ids && !sameSet(got, want.ids.map(id))) return false
      if (want.ids_include && !want.ids_include.every((k) => got.includes(id(k)))) return false
      if (want.min_ids && got.length < want.min_ids) return false
      if (want.date !== undefined && b.date !== day(want.date, today)) return false
      if (want.span && (b.span || 'day') !== want.span) return false
      if (want.min_options && (b.options ?? []).length < want.min_options) return false
      if (want.to !== undefined && b.to !== day(want.to, today)) return false
      if (want.group_by && b.group_by !== want.group_by) return false
      if (want.section && b.section_id !== id(want.section)) return false
      if (want.of && b.of !== want.of) return false
      return true
    })
    if (!match) {
      const detail = ofKind.length ? `; got ${ofKind.map((b) => `${b.kind}${b.date ? ' ' + b.date : ''} ${show(blockIds(b))}`).join(', ')}` : sum.blocks.length ? `; got only ${sum.blocks.map((b) => b.kind).join(', ')}` : '; no block was shown'
      const parts = [want.ids && `ids ${show(want.ids.map(id))}`, want.ids_include && `including ${show(want.ids_include.map(id))}`, want.min_ids && `at least ${want.min_ids} ids`, want.date !== undefined && `on ${day(want.date, today)}`, want.min_options && `${want.min_options}+ options`, want.to !== undefined && `until ${day(want.to, today)}`, want.group_by && `by ${want.group_by}`, want.section && `column ${id(want.section)}`, want.of && `of a ${want.of}`].filter(Boolean)
      fail.push(`expected a ${want.kind} block${parts.length ? ' with ' + parts.join(', ') : ''}${detail}`)
    }
  }
  for (const tool of expect.no_tools ?? []) {
    if (sum.blocks.some((b) => b.kind === DISPLAY_TOOLS[tool])) fail.push(`${tool} must not be called, and it was`)
  }
  for (const p of expect.no_text ?? []) {
    const m = new RegExp(p, 'i').exec(sum.text)
    if (m) fail.push(`the answer must not match /${p}/, and says "${m[0]}"`)
  }
  for (const p of expect.text ?? []) if (!new RegExp(p, 'i').test(sum.text)) fail.push(`the answer must match /${p}/`)
  if (expect.no_map_claim && !sum.blocks.some((b) => b.kind === 'map')) {
    const m = MAP_CLAIM.exec(sum.text)
    if (m) fail.push(`the answer claims a map without showing one: "${m[0]}"`)
  }
  for (const k of expect.links ?? []) {
    if (!sum.text.includes(`(?task=${id(k)})`)) fail.push(`the answer must link the task ${k} as [title](?task=${id(k)})`)
  }
  if (expect.changeset === true && sum.changes.length === 0) fail.push('expected a change set, and nothing was proposed')
  if (expect.changeset === false && sum.changes.length > 0) fail.push(`expected no change set, and ${sum.changes.length} change(s) were proposed`)
  for (const want of expect.changes ?? []) {
    const of = sum.changes.filter((c) => (!want.entity || c.entity === want.entity) && (want.create === undefined || !!c.create === want.create)
      && (want.fields ?? []).every((f) => c.patch && f in c.patch))
    const got = of.map((c) => c.entityId)
    if (want.ids && !sameSet(got, want.ids.map(id))) fail.push(`expected changes to ${want.entity ?? 'items'} ${show(want.ids.map(id))}${want.fields ? ` (${want.fields.join(', ')})` : ''}; got ${show(got)}`)
    if (want.min && of.length < want.min) fail.push(`expected at least ${want.min} change(s) to ${want.entity ?? 'items'}${want.create ? ' created' : ''}; got ${of.length}`)
  }
  if (expect.never_ids?.length) {
    const seen = JSON.stringify([sum.blocks, sum.changes, sum.text])
    for (const k of expect.never_ids) if (seen.includes(id(k))) fail.push(`${k} must never appear, and it did`)
  }
  return fail
}

/** A run of a scenario: every turn's failures; it passes when none failed. */
export function checkRun(scenario, turnEvents, ids = {}, today) {
  const turns = scenario.turns.map((t, i) => {
    const sum = summarize(turnEvents[i] ?? [])
    const failures = turnEvents[i] ? checkTurn(t.expect, sum, ids, today) : ['the turn did not run']
    return { say: t.say, failures, ...sum }
  })
  return { pass: turns.every((t) => t.failures.length === 0), turns }
}

/** Majority voting (design D2): a scenario passes when more than half its runs pass. */
export const passes = (runs) => runs.filter((r) => r.pass).length * 2 > runs.length

const tokensOf = (t) => (t.usage ? (t.usage.input ?? 0) + (t.usage.cached ?? 0) + (t.usage.cache_write ?? 0) + (t.usage.output ?? 0) : 0)
const clip = (s, n = 400) => (s.length > n ? s.slice(0, n) + '…' : s)

/** The report (design D3): report.json's content and report.md's text. */
export function buildReport(results, meta = {}) {
  const scenarios = results.map(({ scenario, runs }) => ({
    name: scenario.name, title: scenario.title, pass: passes(runs),
    passed_runs: runs.filter((r) => r.pass).length, runs: runs.length,
    tokens: runs.reduce((n, r) => n + r.turns.reduce((m, t) => m + tokensOf(t), 0), 0),
    results: runs.map((r) => ({ pass: r.pass, turns: r.turns.map((t) => ({
      say: t.say, failures: t.failures, text: clip(t.text), blocks: t.blocks, changes: t.changes.map((c) => ({ entity: c.entity, entityId: c.entityId, create: !!c.create, fields: Object.keys(c.patch ?? {}) })),
      status: t.status, usage: t.usage, stop: t.stop, error: t.error,
    })) })),
  }))
  const failed = scenarios.filter((s) => !s.pass)
  const json = { ...meta, passed: scenarios.length - failed.length, failed: failed.length, tokens: scenarios.reduce((n, s) => n + s.tokens, 0), scenarios }
  const md = [`# Assistant eval`, '']
  if (meta.provider) md.push(`Provider \`${meta.provider}\`, model \`${meta.model ?? ''}\`, ${meta.runs ?? ''} runs per scenario, ${meta.date ?? ''}.`, '')
  md.push(`**${json.passed} of ${scenarios.length} scenarios pass**, ${json.tokens.toLocaleString('en')} tokens.`, '', '| Scenario | Runs passed | Tokens | Result |', '| --- | --- | --- | --- |')
  for (const s of scenarios) md.push(`| \`${s.name}\` ${s.title} | ${s.passed_runs} of ${s.runs} | ${s.tokens.toLocaleString('en')} | ${s.pass ? 'pass' : '**fail**'} |`)
  for (const s of scenarios) {
    md.push('', `## ${s.name}`, '', s.title)
    s.results.forEach((r, i) => {
      md.push('', `### Run ${i + 1}: ${r.pass ? 'pass' : 'fail'}`)
      for (const t of r.turns) {
        md.push('', `> ${t.say}`, '')
        if (t.blocks.length) md.push(`Blocks: ${t.blocks.map((b) => b.kind).join(', ')}. `)
        if (t.changes.length) md.push(`Changes: ${t.changes.length} (${[...new Set(t.changes.map((c) => c.entity))].join(', ')}).`)
        md.push('', '```text', t.text || '(no text)', '```')
        for (const f of t.failures) md.push(`- Failed: ${f}`)
      }
    })
  }
  return { json, md: md.join('\n') + '\n' }
}
