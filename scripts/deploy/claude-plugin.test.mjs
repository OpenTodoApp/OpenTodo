// node --test scripts/deploy/claude-plugin.test.mjs  (OpenSpec change claude-plugin)
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { readText, ROOT } from './common.mjs'
import { check, checkSecrets, checkSkillNames, DIR, PLUGIN, promptIds, resourceURIs, toolNames } from './claude-plugin.mjs'

const ctx = { changelog: readText('CHANGELOG.md') }
const has = (errors, re) => assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}, got:\n${errors.join('\n')}`)
/** The files check() reads outside deploy/claude-plugin. */
const SOURCES = ['skills', 'LICENSE', 'CHANGELOG.md', 'internal/agenttools/testdata/tools_agent_on.golden.json', 'internal/mcp/resources.go', 'internal/agenttools/skills.go']

/** Runs check() on a copy with `edits` ({ path: text | null }) applied. */
function variant(edits, c = ctx) {
  const dir = mkdtempSync(join(tmpdir(), 'claude-plugin-check-'))
  try {
    for (const p of [DIR, ...SOURCES]) cpSync(join(ROOT, p), join(dir, p), { recursive: true })
    for (const [p, text] of Object.entries(edits)) {
      if (text === null) rmSync(join(dir, p))
      else {
        mkdirSync(dirname(join(dir, p)), { recursive: true })
        writeFileSync(join(dir, p), text)
      }
    }
    return check(c, dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('claude-plugin: the committed marketplace passes', () => {
  assert.deepEqual(check(ctx), [])
})

test('claude-plugin: the server facts are read', () => {
  assert.ok(toolNames().has('create_tasks') && toolNames().has('today_summary'))
  assert.ok(resourceURIs().has('opentodo://views/today') && resourceURIs().has('opentodo://tasks/{id}'))
  assert.ok(promptIds().has('plan-week') && promptIds().has('triage-inbox'))
})

test('claude-plugin: a skill copy that drifts from skills/ fails', () => {
  has(variant({ 'skills/opentodo-mcp/SKILL.md': `${readText('skills/opentodo-mcp/SKILL.md')}\nOne more line.\n` }), /opentodo-mcp\/SKILL\.md differs from skills\/opentodo-mcp/)
  has(variant({ [`${PLUGIN}/skills/opentodo-cli/SKILL.md`]: null }), /opentodo-cli\/SKILL\.md is missing/)
})

test('claude-plugin: unknown tools, resources and prompts fail', () => {
  const known = { tools: toolNames(), resources: resourceURIs(), prompts: promptIds() }
  has(checkSkillNames('x', 'Call `delete_everything` now.', known), /tool delete_everything/)
  has(checkSkillNames('x', 'Read opentodo://views/later first.', known), /resource opentodo:\/\/views\/later/)
  has(checkSkillNames('x', 'Use the prompt `plan-month`.', known), /prompt plan-month/)
  assert.deepEqual(checkSkillNames('x', 'Use `list_tasks`, `client_request_id`, opentodo://projects/{id} and `weekly-review`.', known), [])
  const skill = readText(`${PLUGIN}/skills/today/SKILL.md`)
  has(variant({ [`${PLUGIN}/skills/today/SKILL.md`]: skill.replace('`today_summary`', '`get_today`') }), /names the tool get_today/)
})

test('claude-plugin: the version follows the latest release', () => {
  has(check({ changelog: `## [9.9.9] - 2099-01-01\n${ctx.changelog}` }), /version must be 9\.9\.9/)
})

test('claude-plugin: manifests keep their required fields', () => {
  const plugin = JSON.parse(readText(`${PLUGIN}/.claude-plugin/plugin.json`))
  const edit = (mutate) => {
    const p = structuredClone(plugin)
    mutate(p)
    return variant({ [`${PLUGIN}/.claude-plugin/plugin.json`]: JSON.stringify(p) })
  }
  has(edit((p) => { p.name = 'todo' }), /plugin\.json name must be opentodo/)
  has(edit((p) => { delete p.userConfig.agent_token.sensitive }), /agent_token as a required, sensitive string/)
  const mcp = readText(`${PLUGIN}/.mcp.json`)
  has(variant({ [`${PLUGIN}/.mcp.json`]: mcp.replace('"http"', '"sse"') }), /type must be http/)
  has(variant({ [`${DIR}/upstream/.claude-plugin/marketplace.json`]: '{' }), /not JSON/)
})

test('claude-plugin: no address or token in the plugin', () => {
  has(checkSecrets('f', 'token: ot_abcdefgh12345678'), /shaped like an OpenTodo token/)
  has(checkSecrets('f', '"Authorization": "Bearer abc123"'), /Bearer value/)
  has(checkSecrets('f', 'see https://todo.my-house.net/mcp'), /names the address todo\.my-house\.net/)
  assert.deepEqual(checkSecrets('f', 'Bearer ${user_config.agent_token} https://todo.example.com https://open-todo.app/docs/ `ot_…`'), [])
  const readme = readText(`${DIR}/upstream/README.md`)
  has(variant({ [`${DIR}/upstream/README.md`]: `${readme}\nMine: https://tasks.example.org\n` }), /README\.md names the address tasks\.example\.org/)
})
