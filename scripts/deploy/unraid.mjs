// Unraid Community Applications template (deploy/unraid/opentodo.xml), OpenSpec
// change unraid-template. CA reads it from the template repository
// pixari/unraid-templates, published from deploy/unraid/upstream/: that folder must
// hold an identical copy of the template and a ca_profile.xml. A strict parser for the XML subset CA templates use:
// one <Container version="2"> with child elements that hold text or are empty,
// and <Config> elements with attributes and an optional text value.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { checkShared, readText, ROOT } from './common.mjs'

export const TEMPLATE = 'deploy/unraid/opentodo.xml'
export const UPSTREAM_TEMPLATE = 'deploy/unraid/upstream/templates/opentodo.xml'
export const PROFILE = 'deploy/unraid/upstream/ca_profile.xml'
const RAW = 'https://raw.githubusercontent.com/pixari/opentodo/main/'
export const TEMPLATE_URL = 'https://raw.githubusercontent.com/pixari/unraid-templates/main/templates/opentodo.xml'
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const unescape = (s) => s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENTITIES[e])

/** Parses the CA template subset; throws with a line number on anything else. */
export function parseTemplate(text) {
  const lines = text.split('\n')
  if (lines[0] !== '<?xml version="1.0"?>') throw new Error('line 1: must be <?xml version="1.0"?>')
  if (lines[1] !== '<Container version="2">') throw new Error('line 2: must be <Container version="2">')
  const fields = new Map()
  const configs = []
  let closed = false
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i]
    const no = i + 1
    if (line === '') continue
    if (closed) throw new Error(`line ${no}: content after </Container>`)
    if (line === '</Container>') { closed = true; continue }
    let m = /^  <([A-Za-z]+)\/>$/.exec(line)
    if (m) { set(m[1], ''); continue }
    m = /^  <([A-Za-z]+)>([^<]*)<\/\1>$/.exec(line)
    if (m && m[1] !== 'Config') { set(m[1], unescape(m[2])); continue }
    m = /^  <Config((?: [A-Za-z]+="[^"]*")+)>([^<]*)<\/Config>$/.exec(line) ?? /^  <Config((?: [A-Za-z]+="[^"]*")+)\/>$/.exec(line)
    if (m) {
      const attrs = {}
      for (const a of m[1].matchAll(/ ([A-Za-z]+)="([^"]*)"/g)) attrs[a[1]] = unescape(a[2])
      configs.push({ ...attrs, value: unescape(m[2] ?? ''), line: no })
      continue
    }
    throw new Error(`line ${no}: not in the supported template subset: ${line.trim()}`)
  }
  if (!closed) throw new Error('missing </Container>')
  return { fields, configs }
  function set(name, value) {
    if (fields.has(name)) throw new Error(`<${name}> appears twice`)
    fields.set(name, value)
  }
}

const REQUIRED_FIELDS = ['Name', 'Repository', 'Registry', 'Network', 'Privileged', 'Support', 'Project', 'Overview', 'Category', 'WebUI', 'TemplateURL', 'Icon']
const CONFIG_ATTRS = ['Name', 'Target', 'Default', 'Mode', 'Description', 'Type', 'Display', 'Required', 'Mask']

export function checkTemplate(text, ctx, root = ROOT) {
  if (text === null) return [`${TEMPLATE} is missing`]
  const errors = []
  if (!text.endsWith('\n')) errors.push('template must end with a newline')
  let t
  try {
    t = parseTemplate(text)
  } catch (e) {
    return [...errors, `template is not in the supported XML subset: ${e.message}`]
  }
  const f = t.fields
  for (const k of REQUIRED_FIELDS) if (!f.get(k)) errors.push(`<${k}> is required`)
  if (f.has('Shell') && f.get('Shell') !== '') errors.push('<Shell> must stay empty: the image has no shell')
  if (f.get('Network') && f.get('Network') !== 'bridge') errors.push('<Network> must be bridge')
  if (f.get('Privileged') !== 'false') errors.push('<Privileged> must be false')
  if (f.get('Name') !== ctx.facts.name) errors.push(`<Name> must be ${ctx.facts.name}`)
  if (f.get('Project') !== ctx.facts.project) errors.push(`<Project> must be ${ctx.facts.project}`)
  if (f.get('Support') !== ctx.facts.support) errors.push(`<Support> must be ${ctx.facts.support}`)
  if (f.get('TemplateURL') !== TEMPLATE_URL) errors.push(`<TemplateURL> must be ${TEMPLATE_URL}`)
  if (f.get('Icon') !== RAW + ctx.facts.icon) errors.push(`<Icon> must be ${RAW + ctx.facts.icon}`)
  else if (!existsSync(join(root, ctx.facts.icon))) errors.push(`the icon ${ctx.facts.icon} does not exist`)
  if (f.get('WebUI') !== `http://[IP]:[PORT:${ctx.facts.port}]/`) errors.push(`<WebUI> must be http://[IP]:[PORT:${ctx.facts.port}]/`)
  if (f.get('Category') && !/^([A-Z][A-Za-z]*:([A-Z][A-Za-z]*)? ?)+$/.test(f.get('Category'))) errors.push('<Category> must be CA categories such as "Productivity: Tools:"')

  const variables = new Map()
  let port = null
  let dataTarget = null
  const targets = new Set()
  for (const c of t.configs) {
    for (const a of CONFIG_ATTRS) if (c[a] === undefined) errors.push(`line ${c.line}: <Config> needs the ${a} attribute`)
    if (targets.has(c.Target)) errors.push(`line ${c.line}: ${c.Target} is configured twice`)
    targets.add(c.Target)
    if (!['always', 'advanced'].includes(c.Display)) errors.push(`line ${c.line}: Display must be always or advanced`)
    if (!c.Description) errors.push(`line ${c.line}: ${c.Name} needs a description`)
    if (c.value !== c.Default) errors.push(`line ${c.line}: the value of ${c.Name} must equal its Default`)
    if (c.Type === 'Port') {
      if (port !== null) errors.push('only one port is exposed')
      port = c.Target
      if (c.Mode !== 'tcp') errors.push(`line ${c.line}: the port is tcp`)
    } else if (c.Type === 'Path') {
      if (dataTarget !== null) errors.push('only one path is mounted')
      dataTarget = c.Target
      if (c.Mode !== 'rw') errors.push(`line ${c.line}: the data path must be rw`)
      if (!/^\/mnt\/user\/appdata\/opentodo$/.test(c.Default)) errors.push(`line ${c.line}: the data path default must be /mnt/user/appdata/opentodo`)
    } else if (c.Type === 'Variable') {
      variables.set(c.Target, { default: c.Default, required: c.Required !== 'false' })
      const entry = ctx.facts.variables.find((v) => v.name === c.Target)
      if (entry) {
        if (c.Description !== entry.description) errors.push(`line ${c.line}: the description of ${c.Target} must be the catalogue's (deploy/deploy.json)`)
        if ((c.Mask === 'true') !== Boolean(entry.secret)) errors.push(`line ${c.line}: ${c.Target} must ${entry.secret ? '' : 'not '}be masked`)
      }
    } else {
      errors.push(`line ${c.line}: unsupported Config type ${c.Type}`)
    }
  }
  errors.push(...checkShared({ image: f.get('Repository'), port, dataTarget, variables }, ctx))
  return errors
}

/** The template repository's files: an identical template copy and a CA profile. */
export function checkUpstream(template, upstream, profile) {
  const errors = []
  if (upstream !== template) errors.push(`${UPSTREAM_TEMPLATE} must be identical to ${TEMPLATE}`)
  if (profile === null) return [...errors, `${PROFILE} is missing`]
  const lines = profile.trimEnd().split('\n')
  if (lines[0] !== '<?xml version="1.0"?>' || lines[1] !== '<CommunityApplications>' || lines.at(-1) !== '</CommunityApplications>') {
    errors.push(`${PROFILE} must be one <CommunityApplications> element`)
  }
  if (!/<Profile>[^<]+<\/Profile>/.test(profile)) errors.push(`${PROFILE} needs a <Profile>`)
  return errors
}

export function check(ctx, root = ROOT) {
  const template = readText(TEMPLATE, root)
  return [
    ...checkTemplate(template, ctx, root),
    ...checkUpstream(template, readText(UPSTREAM_TEMPLATE, root), readText(PROFILE, root)),
  ]
}

export const summary = 'release tag, port, appdata path, Web UI, icon, variables and upstream copy'
