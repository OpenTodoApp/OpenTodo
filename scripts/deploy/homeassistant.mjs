// Home Assistant add-on (deploy/homeassistant/), OpenSpec change homeassistant-addon. Home
// Assistant OS and Supervised installs add add-on repositories by URL, so OpenTodo has its own,
// pixari/opentodo-homeassistant-addons, whose content is deploy/homeassistant/upstream/ file for
// file. The add-on is upstream/opentodo/: config.yaml, a Dockerfile that copies the OpenTodo
// binary from the released image onto Home Assistant's base image, run.sh (options to
// OPENTODO_* variables), translations, docs and images. Policy 'release': the add-on's version is
// the OpenTodo release it runs (Home Assistant offers an update when `version` changes), and the
// Follow OpenTodo workflow in that repository bumps it (deploy/homeassistant/README.md).

import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { checkShared, isMap, latestRelease, listFiles, pngSize, readText, ROOT, same } from './common.mjs'
import { parseYaml, YAML_FULL } from './yaml.mjs'

export const UPSTREAM = 'deploy/homeassistant/upstream'
export const ADDON = `${UPSTREAM}/opentodo`
export const REPOSITORY = 'https://github.com/pixari/opentodo-homeassistant-addons'
export const IMAGE = 'ghcr.io/pixari/opentodo-homeassistant'
export const FILES = [
  '.github/dependabot.yml', '.github/workflows/build.yaml', '.github/workflows/follow.yaml', '.github/workflows/test.yaml',
  '.gitignore', 'LICENSE', 'README.md', 'repository.yaml', 'scripts/bump.sh',
  'opentodo/CHANGELOG.md', 'opentodo/DOCS.md', 'opentodo/Dockerfile', 'opentodo/README.md', 'opentodo/apparmor.txt',
  'opentodo/config.yaml', 'opentodo/icon.png', 'opentodo/logo.png', 'opentodo/run.sh', 'opentodo/translations/en.yaml',
]
/** Each add-on option and the variable run.sh sets from it. */
export const OPTIONS = {
  base_url: 'OPENTODO_BASE_URL',
  setup_token: 'OPENTODO_SETUP_TOKEN',
  allow_signup: 'OPENTODO_ALLOW_SIGNUP',
  trusted_proxies: 'OPENTODO_TRUSTED_PROXIES',
  log_level: 'OPENTODO_LOG_LEVEL',
}
/** The schema type each option must have (password for secrets, a closed list for the level). */
const SCHEMA = { base_url: 'url?', setup_token: 'password?', allow_signup: 'bool', trusted_proxies: 'str?', log_level: 'list(debug|info|warn|error)' }
const ALLOWED_KEYS = ['name', 'version', 'slug', 'description', 'url', 'arch', 'image', 'init', 'ports', 'webui', 'backup', 'options', 'schema']

function yaml(rel, root, errors) {
  const text = readText(rel, root)
  if (text === null) { errors.push(`${rel} is missing`); return null }
  try {
    return parseYaml(text, YAML_FULL)
  } catch (e) {
    errors.push(`${rel} is not in the supported YAML subset: ${e.message}`)
    return null
  }
}

/** The add-on version: the latest release, or that release plus a fourth number for an add-on-only change. */
export function checkVersion(version, changelog) {
  if (!changelog) return []
  const r = latestRelease(changelog)
  const v = `${r.major}.${r.minor}.${r.patch}`
  return new RegExp(`^${v.replace(/\./g, '\\.')}(\\.\\d+)?$`).test(version ?? '')
    ? []
    : [`version must be ${v} (or ${v}.<n> for a change to the add-on alone), the latest release in CHANGELOG.md, got: ${version}`]
}

export function checkConfig(c, ctx) {
  const errors = []
  if (!isMap(c)) return { errors: ['config.yaml must be a map'] }
  for (const k of Object.keys(c)) if (!ALLOWED_KEYS.includes(k)) errors.push(`config.yaml: ${k} is not used by this add-on${k === 'ingress' ? ' (OpenTodo needs the root of its own address, see deploy/homeassistant/README.md)' : ''}`)
  if (c.name !== ctx.facts.name) errors.push(`config.yaml: name must be ${ctx.facts.name}`)
  if (c.slug !== 'opentodo') errors.push('config.yaml: slug must be opentodo')
  if (c.description !== ctx.facts.summary) errors.push('config.yaml: description must be the summary in deploy/deploy.json')
  if (c.url !== `${REPOSITORY}/tree/main/opentodo`) errors.push(`config.yaml: url must be ${REPOSITORY}/tree/main/opentodo`)
  if (typeof c.version !== 'string') errors.push('config.yaml: version must be a quoted string')
  errors.push(...checkVersion(String(c.version), ctx.changelog).map((e) => `config.yaml: ${e}`))
  if (!same([...(c.arch ?? [])].sort(), ['aarch64', 'amd64'])) errors.push('config.yaml: arch must be aarch64 and amd64')
  if (c.image !== IMAGE) errors.push(`config.yaml: image must be ${IMAGE} (no tag: the Supervisor pulls the tag named version)`)
  if (c.init !== false) errors.push('config.yaml: init must be false (the base image has its own init)')
  if (c.backup !== 'cold') errors.push('config.yaml: backup must be cold, so the database is copied while OpenTodo is stopped')
  const ports = isMap(c.ports) ? Object.entries(c.ports) : []
  if (ports.length !== 1 || !/^\d+\/tcp$/.test(ports[0][0])) errors.push('config.yaml: ports must map exactly one container port, "<port>/tcp"')
  const port = ports.length === 1 ? ports[0][0].split('/')[0] : null
  if (ports.length === 1 && ports[0][1] !== ctx.facts.port) errors.push(`config.yaml: the default host port must be ${ctx.facts.port}`)
  if (c.webui !== `http://[HOST]:[PORT:${ctx.facts.port}]/`) errors.push(`config.yaml: webui must be http://[HOST]:[PORT:${ctx.facts.port}]/`)

  const schema = isMap(c.schema) ? c.schema : {}
  const options = isMap(c.options) ? c.options : {}
  if (!same(Object.keys(schema).sort(), Object.keys(OPTIONS).sort())) errors.push(`config.yaml: schema must have exactly ${Object.keys(OPTIONS).join(', ')}`)
  for (const [k, t] of Object.entries(SCHEMA)) if (k in schema && schema[k] !== t) errors.push(`config.yaml: schema.${k} must be ${t}`)
  const variables = new Map()
  for (const [k, name] of Object.entries(OPTIONS)) {
    if (!(k in schema)) continue
    const optional = String(schema[k]).endsWith('?')
    if (optional && k in options) errors.push(`config.yaml: ${k} is optional, leave it out of options (its default is empty)`)
    if (!optional && !(k in options)) errors.push(`config.yaml: options needs a default for ${k}`)
    variables.set(name, { default: k in options ? String(options[k]) : '', required: false })
  }
  for (const k of Object.keys(options)) if (!(k in OPTIONS)) errors.push(`config.yaml: option ${k} has no OPENTODO_* variable`)
  return { errors, port, variables, version: typeof c.version === 'string' ? c.version : null }
}

/** Every option has a name and the catalogue's description; the port has a label. */
export function checkTranslations(t, ctx) {
  const errors = []
  const conf = isMap(t?.configuration) ? t.configuration : {}
  for (const [k, name] of Object.entries(OPTIONS)) {
    const entry = ctx.facts.variables.find((v) => v.name === name)
    if (!conf[k]?.name) errors.push(`translations/en.yaml: ${k} needs a name`)
    if (entry && conf[k]?.description !== entry.description) errors.push(`translations/en.yaml: the description of ${k} must be the catalogue's for ${name} (deploy/deploy.json)`)
  }
  for (const k of Object.keys(conf)) if (!(k in OPTIONS)) errors.push(`translations/en.yaml: ${k} is not an option`)
  if (!t?.network?.[`${ctx.facts.port}/tcp`]) errors.push(`translations/en.yaml: network needs a label for ${ctx.facts.port}/tcp`)
  return errors
}

/** The image: OpenTodo's binary from the release, on Home Assistant's base, with the data in /data. */
export function checkDockerfile(text, ctx) {
  if (text === null) return { errors: [`${ADDON}/Dockerfile is missing`] }
  const errors = []
  const version = /^ARG OPENTODO_VERSION=(\S+)$/m.exec(text)?.[1]
  if (!version) errors.push('Dockerfile: needs ARG OPENTODO_VERSION=<release> (scripts/bump.sh changes it)')
  if (!new RegExp(`^FROM ${ctx.facts.image.replace(/[./]/g, '\\$&')}:\\$\\{OPENTODO_VERSION\\} AS opentodo$`, 'm').test(text)) errors.push(`Dockerfile: needs FROM ${ctx.facts.image}:\${OPENTODO_VERSION} AS opentodo`)
  if (!/^FROM ghcr\.io\/home-assistant\/base:\d+\.\d+$/m.test(text)) errors.push('Dockerfile: the add-on must be FROM ghcr.io/home-assistant/base:<x.y> (Dependabot follows it)')
  if (!/^COPY --from=opentodo \/opentodo \/usr\/bin\/opentodo$/m.test(text)) errors.push('Dockerfile: must COPY --from=opentodo /opentodo /usr/bin/opentodo')
  if (!/^HEALTHCHECK .*CMD \["\/usr\/bin\/opentodo", "healthcheck"\]$/m.test(text)) errors.push('Dockerfile: the HEALTHCHECK must run ["/usr/bin/opentodo", "healthcheck"]')
  const env = (name) => new RegExp(`(?:ENV|\\\\)\\s+${name}=(\\S+)`).exec(text)?.[1]
  if (env('OPENTODO_ADDR') !== `:${ctx.facts.port}`) errors.push(`Dockerfile: ENV OPENTODO_ADDR must be :${ctx.facts.port}`)
  if (!/^CMD \["\/run\.sh"\]$/m.test(text)) errors.push('Dockerfile: CMD must be ["/run.sh"]')
  return { errors, version, dataTarget: env('OPENTODO_DATA_DIR') }
}

/** run.sh reads every option and exports its variable. */
export function checkRunScript(text) {
  if (text === null) return [`${ADDON}/run.sh is missing`]
  const errors = []
  if (!text.startsWith('#!/usr/bin/with-contenv bashio\n')) errors.push('run.sh must start with #!/usr/bin/with-contenv bashio')
  for (const [k, name] of Object.entries(OPTIONS)) {
    if (!text.includes(`option ${k}`)) errors.push(`run.sh does not read the option ${k}`)
    if (!new RegExp(`export ${name}=`).test(text)) errors.push(`run.sh does not export ${name}`)
  }
  if (!/^exec \/usr\/bin\/opentodo$/m.test(text)) errors.push('run.sh must end by exec /usr/bin/opentodo')
  return errors
}

export function checkRepository(r) {
  const errors = []
  if (!r?.name) errors.push('repository.yaml needs a name')
  if (r?.url !== REPOSITORY) errors.push(`repository.yaml: url must be ${REPOSITORY}`)
  if (!/^.+ <[^@\s]+@[^@\s]+>$/.test(r?.maintainer ?? '')) errors.push('repository.yaml: maintainer must be "Name <email>"')
  return errors
}

export function checkFiles(root = ROOT) {
  const up = join(root, UPSTREAM)
  if (!existsSync(up)) return [`${UPSTREAM}/ is missing`]
  const errors = []
  const have = listFiles(up).map((f) => relative(up, f)).sort()
  for (const f of FILES) if (!have.includes(f)) errors.push(`${UPSTREAM}/${f} is missing`)
  for (const f of have) if (!FILES.includes(f)) errors.push(`${UPSTREAM}/${f} is not part of the add-on repository`)
  const png = (f) => existsSync(join(up, f)) ? pngSize(readFileSync(join(up, f))) : null
  const icon = png('opentodo/icon.png')
  if (!icon || icon.width !== 128 || icon.height !== 128) errors.push('opentodo/icon.png must be a 128x128 PNG')
  if (!png('opentodo/logo.png')) errors.push('opentodo/logo.png must be a PNG')
  return errors
}

export function check(ctx, root = ROOT) {
  const errors = [...checkFiles(root)]
  const cfg = checkConfig(yaml(`${ADDON}/config.yaml`, root, errors), ctx)
  errors.push(...cfg.errors)
  const tr = yaml(`${ADDON}/translations/en.yaml`, root, errors)
  if (tr) errors.push(...checkTranslations(tr, ctx))
  const repo = yaml(`${UPSTREAM}/repository.yaml`, root, errors)
  if (repo) errors.push(...checkRepository(repo))
  const docker = checkDockerfile(readText(`${ADDON}/Dockerfile`, root), ctx)
  errors.push(...docker.errors)
  errors.push(...checkRunScript(readText(`${ADDON}/run.sh`, root)))
  if (cfg.version && docker.version && !cfg.version.startsWith(`${docker.version}`)) errors.push(`config.yaml version ${cfg.version} must start with the OpenTodo version in the Dockerfile, ${docker.version}`)
  const changes = readText(`${ADDON}/CHANGELOG.md`, root) ?? ''
  if (cfg.version && !new RegExp(`^## ${cfg.version.replace(/\./g, '\\.')}$`, 'm').test(changes)) errors.push(`opentodo/CHANGELOG.md needs a "## ${cfg.version}" entry`)
  if (cfg.variables) {
    errors.push(...checkShared({ image: docker.version ? `${ctx.facts.image}:${docker.version}` : null, port: cfg.port, dataTarget: docker.dataTarget, variables: cfg.variables, policy: 'release' }, ctx))
  }
  return errors
}

export const summary = 'add-on config, options to variables, translations, release in the Dockerfile and version, images and repository files'
