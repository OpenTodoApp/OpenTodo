// Claude Code plugin marketplace (deploy/claude-plugin/), OpenSpec change claude-plugin.
// deploy/claude-plugin/upstream/ is the repository pixari/opentodo-claude file for file: a
// marketplace "opentodo" listing one plugin, plugins/opentodo/, with copies of the agent skills
// under skills/, two task skills and the MCP connection (userConfig asks for the server address
// and a sensitive token). The checks keep it honest against the code: copies equal their source,
// the skills name only tools, resources and prompts the MCP server offers, the version is the
// latest release, and nothing in it looks like a real address or token.

import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { latestRelease, listFiles, readText, ROOT } from './common.mjs'

export const DIR = 'deploy/claude-plugin'
export const UPSTREAM = 'deploy/claude-plugin/upstream'
export const PLUGIN = `${UPSTREAM}/plugins/opentodo`
const NAME = 'opentodo'
/** The skills copied into the plugin from skills/, byte for byte. */
export const COPIED = ['opentodo-mcp', 'opentodo-cli']
/** Skills that use the MCP server and so may name its tools, resources and prompts. */
const MCP_SKILLS = ['opentodo-mcp', 'today', 'plan-week']
const TOOLS = 'internal/agenttools/testdata/tools_agent_on.golden.json'
const RESOURCES = 'internal/mcp/resources.go'
const PROMPTS = 'internal/agenttools/skills.go'
/** Hosts a file in the plugin may name: documentation and the example server, never a real one. */
const HOSTS = ['open-todo.app', 'github.com', 'code.claude.com', 'todo.example.com']
/** A backticked name that reads like a tool call: one of the registry's verbs, then an object. */
const TOOL_LIKE = /^(list|get|search|create|update|complete|reopen|move|schedule|trash|add|set|reorder|delete|remove|today)_[a-z_]+$/

/** Tool names an agent token sees with writes allowed (the registry's golden list). */
export function toolNames(root = ROOT) {
  const d = JSON.parse(readText(TOOLS, root) ?? '[]')
  return new Set((Array.isArray(d) ? d : d.tools ?? []).map((t) => t.name))
}

/** opentodo:// URIs and URI templates the MCP server lists. */
export function resourceURIs(root = ROOT) {
  const src = readText(RESOURCES, root) ?? ''
  return new Set([...src.matchAll(/URI(?:Template)?: "(opentodo:\/\/[^"]+)"/g)].map((m) => m[1]))
}

/** The workflow ids the MCP server offers as prompts. */
export function promptIds(root = ROOT) {
  const src = readText(PROMPTS, root) ?? ''
  return new Set([...src.matchAll(/\bID: "([a-z-]+)"/g)].map((m) => m[1]))
}

/** Names in `backticks` that a skill uses as tools, resources or prompts, checked against the server. */
export function checkSkillNames(name, text, { tools, resources, prompts }) {
  const errors = []
  for (const [, tick] of text.matchAll(/`([^`\n]+)`/g)) {
    if (TOOL_LIKE.test(tick) && !tools.has(tick)) errors.push(`skill ${name} names the tool ${tick}, which the MCP server does not offer (${TOOLS})`)
    if (/^[a-z]+(-[a-z]+)+$/.test(tick) && !prompts.has(tick) && !COPIED.includes(tick)) errors.push(`skill ${name} names the prompt ${tick}, which the MCP server does not offer (${PROMPTS})`)
  }
  for (const [uri] of text.matchAll(/opentodo:\/\/[a-z/{}]+[a-z}]/g)) {
    if (!resources.has(uri)) errors.push(`skill ${name} names the resource ${uri}, which the MCP server does not list (${RESOURCES})`)
  }
  return errors
}

/** Strings that look like a credential or a real server address. */
export function checkSecrets(rel, text) {
  const errors = []
  if (/\bot_[A-Za-z0-9]{8,}|\botap_[A-Za-z0-9]{8,}/.test(text)) errors.push(`${rel} contains something shaped like an OpenTodo token`)
  for (const [, value] of text.matchAll(/Bearer\s+([^\s"'`]+)/g)) {
    if (!value.startsWith('${user_config.') && !value.startsWith('<')) errors.push(`${rel} has a Bearer value that is not \${user_config.…}: ${value}`)
  }
  for (const [, host] of text.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)) {
    if (!HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) errors.push(`${rel} names the address ${host}; a plugin names no server, the user enters theirs`)
  }
  return errors
}

function json(rel, root, errors) {
  const text = readText(rel, root)
  if (text === null) {
    errors.push(`${rel} is missing`)
    return null
  }
  try {
    return JSON.parse(text)
  } catch (e) {
    errors.push(`${rel} is not JSON: ${e.message}`)
    return null
  }
}

/** The manifests' documented required fields (code.claude.com/docs/en/plugin-marketplaces, …/plugins-reference). */
export function checkManifests(root, changelog) {
  const errors = []
  const market = json(`${UPSTREAM}/.claude-plugin/marketplace.json`, root, errors)
  const plugin = json(`${PLUGIN}/.claude-plugin/plugin.json`, root, errors)
  const mcp = json(`${PLUGIN}/.mcp.json`, root, errors)
  if (market) {
    if (market.name !== NAME) errors.push(`marketplace.json name must be ${NAME}`)
    if (!market.owner?.name) errors.push('marketplace.json needs owner.name')
    const entry = market.plugins?.find((p) => p.name === NAME)
    if (!entry) errors.push(`marketplace.json must list the plugin ${NAME}`)
    else if (entry.source !== `./plugins/${NAME}`) errors.push(`marketplace.json: the ${NAME} entry's source must be ./plugins/${NAME}`)
  }
  if (plugin) {
    if (plugin.name !== NAME) errors.push(`plugin.json name must be ${NAME}, the same as its marketplace entry`)
    const rel = latestRelease(changelog)
    const want = `${rel.major}.${rel.minor}.${rel.patch}`
    if (plugin.version !== want) errors.push(`plugin.json version must be ${want}, the latest release in CHANGELOG.md, got: ${plugin.version}`)
    const url = plugin.userConfig?.server_url
    const token = plugin.userConfig?.agent_token
    if (!url || url.type !== 'string' || !url.required) errors.push('plugin.json userConfig must ask for server_url (a required string)')
    if (!token || token.type !== 'string' || !token.required || token.sensitive !== true) errors.push('plugin.json userConfig must ask for agent_token as a required, sensitive string')
  }
  const server = mcp?.mcpServers?.[NAME]
  if (mcp && !server) errors.push(`.mcp.json must define the server ${NAME}`)
  if (server) {
    if (server.type !== 'http') errors.push('.mcp.json: the server type must be http (streamable HTTP)')
    if (server.url !== '${user_config.server_url}/mcp') errors.push('.mcp.json: url must be ${user_config.server_url}/mcp')
    if (server.headers?.Authorization !== 'Bearer ${user_config.agent_token}') errors.push('.mcp.json: Authorization must be Bearer ${user_config.agent_token}')
  }
  return errors
}

export function check(ctx, root = ROOT) {
  const errors = checkManifests(root, ctx.changelog)
  for (const s of COPIED) {
    const src = readText(`skills/${s}/SKILL.md`, root)
    const copy = readText(`${PLUGIN}/skills/${s}/SKILL.md`, root)
    if (copy === null) errors.push(`${PLUGIN}/skills/${s}/SKILL.md is missing`)
    else if (copy !== src) errors.push(`${PLUGIN}/skills/${s}/SKILL.md differs from skills/${s}/SKILL.md (copy it: cp skills/${s}/SKILL.md ${PLUGIN}/skills/${s}/SKILL.md)`)
  }
  const known = { tools: toolNames(root), resources: resourceURIs(root), prompts: promptIds(root) }
  for (const s of MCP_SKILLS) {
    const text = readText(`${PLUGIN}/skills/${s}/SKILL.md`, root)
    if (text === null) errors.push(`${PLUGIN}/skills/${s}/SKILL.md is missing`)
    else errors.push(...checkSkillNames(s, text, known))
  }
  const license = existsSync(join(root, UPSTREAM, 'LICENSE')) ? readFileSync(join(root, UPSTREAM, 'LICENSE'), 'utf8') : null
  if (license !== readText('LICENSE', root)) errors.push(`${UPSTREAM}/LICENSE must be a copy of the repository's LICENSE`)
  for (const file of listFiles(join(root, UPSTREAM))) {
    const rel = relative(root, file)
    if (rel.endsWith('LICENSE') || rel.endsWith('.png')) continue
    errors.push(...checkSecrets(rel, readFileSync(file, 'utf8')))
  }
  return errors
}

export const summary = 'marketplace and plugin manifests, version = latest release, skill copies, tools, resources and prompts named by the skills, no address or token'
