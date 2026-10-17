// Portainer app template (deploy/portainer/portainer-template.json), OpenSpec change
// platform-catalogs. Portainer reads a v3 template list ({"version":"3","templates":[...]}) from the
// URL in Settings -> App Templates; this file is one such list with a single container (type 1)
// template, served from the main branch. The community list Lissy93/portainer-templates pulls it
// daily through one row in its sources.csv (deploy/portainer/upstream/sources.csv.row), and its
// rules apply: one template, no id (the list assigns ids), a description ending with "Source: <repo>",
// one to three existing categories, a label on every variable, string values, the protocol on ports.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { checkShared, readText, ROOT } from './common.mjs'

export const TEMPLATE = 'deploy/portainer/portainer-template.json'
export const ROW = 'deploy/portainer/upstream/sources.csv.row'
const RAW = 'https://raw.githubusercontent.com/pixari/opentodo/main/'
export const TEMPLATE_URL = RAW + TEMPLATE
const DOCS = 'https://open-todo.app/docs/self-hosting/portainer/'
// Categories already used in Lissy93/portainer-templates, so the app lands in an existing group.
const CATEGORIES = ['Productivity', 'Tools', 'Other', 'Documents', 'Business Apps', 'Project Management']

const FIELDS = ['type', 'title', 'name', 'description', 'categories', 'platform', 'logo', 'image', 'restart_policy', 'ports', 'volumes', 'env', 'note']
const ENV_KEYS = ['name', 'label', 'description', 'default', 'preset', 'select']

export function checkTemplate(text, ctx, root = ROOT) {
  if (text === null) return [`${TEMPLATE} is missing`]
  const errors = []
  if (!text.endsWith('\n')) errors.push('the template must end with a newline')
  let doc
  try {
    doc = JSON.parse(text)
  } catch (e) {
    return [`${TEMPLATE} is not JSON: ${e.message}`]
  }
  if (doc?.version !== '3' || !Array.isArray(doc.templates) || Object.keys(doc).length !== 2) {
    return [...errors, 'the file must be {"version": "3", "templates": [...]}, the list format Portainer reads']
  }
  if (doc.templates.length !== 1) return [...errors, 'the list holds exactly one template (Lissy93/portainer-templates drops an app source with more)']
  const t = doc.templates[0]
  for (const k of Object.keys(t)) if (!FIELDS.includes(k)) errors.push(`unexpected field "${k}"${k === 'id' ? ' (leave id out: the list assigns it)' : ''}`)
  for (const k of FIELDS) if (t[k] === undefined) errors.push(`"${k}" is required`)
  if (t.type !== 1) errors.push('type must be 1 (a container)')
  if (t.title !== ctx.facts.name) errors.push(`title must be ${ctx.facts.name}`)
  if (t.name !== 'opentodo') errors.push('name must be opentodo')
  const source = ` Source: ${ctx.facts.repository}`
  if (t.description !== ctx.facts.summary + source) errors.push(`description must be the summary in deploy/deploy.json followed by "${source.trim()}"`)
  if (!Array.isArray(t.categories) || t.categories.length < 1 || t.categories.length > 3 || t.categories.some((c) => !CATEGORIES.includes(c))) {
    errors.push(`categories: one to three of ${CATEGORIES.join(', ')}`)
  }
  if (t.platform !== 'linux') errors.push('platform must be linux')
  if (t.logo !== RAW + ctx.facts.icon) errors.push(`logo must be ${RAW + ctx.facts.icon}`)
  else if (!existsSync(join(root, ctx.facts.icon))) errors.push(`the logo ${ctx.facts.icon} does not exist`)
  if (t.restart_policy !== 'unless-stopped') errors.push('restart_policy must be unless-stopped')

  let port = null
  if (!Array.isArray(t.ports) || t.ports.length !== 1) errors.push('publish exactly one port')
  else {
    const m = /^(\d+):(\d+)\/tcp$/.exec(t.ports[0])
    if (!m) errors.push('ports are "host:container/tcp", without a host IP')
    else {
      port = m[2]
      if (m[1] !== m[2]) errors.push('the default host port is the container port, 8080')
    }
  }
  let dataTarget = null
  if (!Array.isArray(t.volumes) || t.volumes.length !== 1) errors.push('mount exactly one volume')
  else {
    const v = t.volumes[0]
    if (Object.keys(v).join() !== 'container') errors.push('the volume is {"container": "/data"}: a new Docker volume, no bind mount')
    dataTarget = v.container
  }

  const variables = new Map()
  for (const e of Array.isArray(t.env) ? t.env : []) {
    for (const k of Object.keys(e)) if (!ENV_KEYS.includes(k)) errors.push(`env ${e.name}: unexpected key "${k}"`)
    if (typeof e.name !== 'string' || !e.name) { errors.push('every env entry needs a name'); continue }
    if (variables.has(e.name)) errors.push(`env ${e.name} is listed twice`)
    if (!e.label) errors.push(`env ${e.name} needs a label`)
    if (!e.description) errors.push(`env ${e.name} needs a description`)
    if (e.default !== undefined && typeof e.default !== 'string') errors.push(`env ${e.name}: default must be a string`)
    if (e.preset !== undefined) errors.push(`env ${e.name}: no preset, people must be able to change it`)
    let def = e.default ?? ''
    if (e.select !== undefined) {
      const opts = Array.isArray(e.select) ? e.select : []
      const defaults = opts.filter((o) => o.default === true)
      if (opts.length < 2 || opts.some((o) => typeof o.text !== 'string' || typeof o.value !== 'string')) errors.push(`env ${e.name}: select options need a text and a string value`)
      if (defaults.length !== 1) errors.push(`env ${e.name}: mark exactly one select option as the default, or Portainer sends a blank value`)
      if (e.default !== undefined) errors.push(`env ${e.name}: a select takes its default from the option marked default`)
      def = defaults[0]?.value ?? ''
    }
    const entry = ctx.facts.variables.find((v) => v.name === e.name)
    if (entry?.secret && def !== '') errors.push(`env ${e.name}: never ship a default secret`)
    variables.set(e.name, { default: def, required: false })
  }
  if (typeof t.note !== 'string' || !t.note.includes(DOCS)) errors.push(`the note must link the guide, ${DOCS}`)
  else {
    if (/<(?!\/?(?:b|code|br|a)\b)[a-z]/i.test(t.note)) errors.push('the note uses only <b>, <code>, <br> and <a> (Portainer strips the rest)')
    if (!/first visitor/.test(t.note)) errors.push('the note must say the first visitor creates the owner account')
    if (!/\/data/.test(t.note)) errors.push('the note must say where the data lives (/data)')
  }
  errors.push(...checkShared({ image: t.image, port, dataTarget, variables, policy: 'stable' }, ctx))
  return errors
}

/** The row for Lissy93/portainer-templates' sources.csv: name, raw URL of the file on a branch, repo, app. */
export function checkRow(text, ctx) {
  if (text === null) return [`${ROW} is missing`]
  const want = `opentodo, ${TEMPLATE_URL}, ${ctx.facts.repository}/, app\n`
  return text === want ? [] : [`${ROW} must be exactly: ${want.trim()}`]
}

export function check(ctx, root = ROOT) {
  const errors = [...checkTemplate(readText(TEMPLATE, root), ctx, root), ...checkRow(readText(ROW, root), ctx)]
  if (!existsSync(join(root, 'deploy/portainer/upstream/PR.md'))) errors.push('deploy/portainer/upstream/PR.md is missing')
  return errors
}

export const summary = 'v3 list with one container template, stable tag, port, /data volume, labelled variables, note and sources.csv row'
