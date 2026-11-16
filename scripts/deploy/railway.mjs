// Railway template (deploy/railway), OpenSpec change platform-catalogs. Railway templates are
// made in its dashboard (the template composer) and published from the owning workspace; there
// is no file to import. deploy/railway/template.json records what the template holds, and this
// checks it: one service from the stable image, a volume on /data, /healthz, HTTP on the
// container port, the base URL from the service's own domain, a generated setup token
// (Railway's best practices forbid default credentials), and RAILWAY_RUN_UID=0, because the
// image runs as a non-root user and Railway's volumes are writable by root
// (https://docs.railway.com/reference/volumes, https://docs.railway.com/templates/best-practices).

import { checkShared, isMap, readText, ROOT } from './common.mjs'

export const TEMPLATE = 'deploy/railway/template.json'
export const OVERVIEW = 'deploy/railway/overview.md'
export const README = 'deploy/railway/README.md'
export const DOCS = 'docs/self-hosting/railway.md'

const ROOT_FIELDS = ['$comment', 'name', 'description', 'icon', 'category', 'overview', 'service']
const SERVICE_FIELDS = ['name', 'source', 'healthcheckPath', 'replicas', 'networking', 'volume', 'variables']
/** The headings Railway's best practices ask of a template overview, in order. */
export const OVERVIEW_HEADINGS = [
  '# Deploy and Host OpenTodo with Railway',
  '## About Hosting OpenTodo',
  '## Common Use Cases',
  '## Dependencies for OpenTodo Hosting',
  '### Deployment Dependencies',
  '### Why Deploy OpenTodo on Railway?',
]
/** Values the template must set exactly this way. */
const FIXED = {
  OPENTODO_BASE_URL: 'https://${{RAILWAY_PUBLIC_DOMAIN}}',
  OPENTODO_SETUP_TOKEN: '${{secret(32)}}',
  RAILWAY_RUN_UID: '0',
}
const PLATFORM_VALUES = new Set(['OPENTODO_BASE_URL', 'OPENTODO_SETUP_TOKEN'])

export function checkTemplate(text, ctx) {
  if (text === null) return [`${TEMPLATE} is missing`]
  let t
  try {
    t = JSON.parse(text)
  } catch (e) {
    return [`template.json is not valid JSON: ${e.message}`]
  }
  const errors = []
  if (!isMap(t)) return ['template.json must be an object']
  for (const k of Object.keys(t)) if (!ROOT_FIELDS.includes(k)) errors.push(`template.json: "${k}" is not a template field`)
  if (t.name !== 'OpenTodo') errors.push('template.json: name must be OpenTodo (the brand spelling)')
  if (t.description !== ctx.facts.summary) errors.push('template.json: description must be the summary in deploy/deploy.json')
  if (typeof t.icon !== 'string' || !t.icon.startsWith('https://') || !t.icon.endsWith('.png')) errors.push('template.json: icon must be an https URL of a PNG (1:1, transparent background)')
  if (t.overview !== OVERVIEW) errors.push(`template.json: overview must be ${OVERVIEW}`)
  const s = t.service
  if (!isMap(s)) return [...errors, 'template.json: service is required']
  for (const k of Object.keys(s)) if (!SERVICE_FIELDS.includes(k)) errors.push(`service: "${k}" is not a field this template uses`)
  if (!isMap(s.source) || Object.keys(s.source).join() !== 'image') errors.push('service: source must be { image } (the released image, no repository build)')
  if (s.healthcheckPath !== '/healthz') errors.push('service: healthcheckPath must be /healthz')
  if (s.replicas !== 1) errors.push('service: replicas must be 1 (Railway allows no replicas with a volume, and SQLite has one writer)')
  if (!isMap(s.networking) || s.networking.http !== true) errors.push('service: networking.http must be true (a generated https domain)')
  const variables = new Map()
  const values = new Map()
  for (const v of Array.isArray(s.variables) ? s.variables : []) {
    if (!isMap(v) || typeof v.name !== 'string' || typeof v.value !== 'string') { errors.push('variables: every entry needs a name and a string value'); continue }
    if (values.has(v.name)) errors.push(`variables: ${v.name} is listed twice`)
    if (typeof v.description !== 'string' || v.description.length < 10) errors.push(`variables ${v.name}: a description is required (Railway's best practices)`)
    values.set(v.name, v.value)
    if (v.name.startsWith('OPENTODO_')) variables.set(v.name, { default: PLATFORM_VALUES.has(v.name) ? undefined : v.value, required: false })
    else if (v.name !== 'PORT' && v.name !== 'RAILWAY_RUN_UID') errors.push(`variables: ${v.name} is not read by OpenTodo or Railway`)
  }
  for (const [name, want] of Object.entries(FIXED)) {
    if (values.get(name) !== want) errors.push(`variables ${name}: must be ${want}`)
  }
  const port = values.get('PORT') ?? null
  if (!isMap(s.networking) || String(s.networking.targetPort) !== String(port)) errors.push('service: networking.targetPort must equal PORT')
  if (port === null) errors.push('variables: PORT must be set to the container port, so Railway routes and health-checks it')
  errors.push(...checkShared({ image: isMap(s.source) ? s.source.image : null, port, dataTarget: isMap(s.volume) ? s.volume.mountPath : null, variables, policy: 'stable' }, ctx))
  return errors
}

export function checkOverview(text) {
  if (text === null) return [`${OVERVIEW} is missing`]
  const lines = text.split('\n')
  const errors = []
  let at = -1
  for (const h of OVERVIEW_HEADINGS) {
    const i = lines.indexOf(h)
    if (i < 0) errors.push(`overview.md: the heading "${h}" is missing (Railway's best practices)`)
    else if (i < at) errors.push(`overview.md: "${h}" is out of order`)
    else at = i
  }
  return errors
}

/** The README and the guide say plainly that the template is not yet published. */
export function checkStatus(readme, docs) {
  const errors = []
  if (readme === null) errors.push(`${README} is missing`)
  if (docs === null) errors.push(`${DOCS} is missing`)
  else if (!docs.includes('RAILWAY_RUN_UID')) errors.push(`${DOCS} must explain RAILWAY_RUN_UID`)
  return errors
}

export function check(ctx, root = ROOT) {
  return [...checkTemplate(readText(TEMPLATE, root), ctx), ...checkOverview(readText(OVERVIEW, root)), ...checkStatus(readText(README, root), readText(DOCS, root))]
}

export const summary = 'template record: one image service, stable tag, /data volume, /healthz, HTTP on PORT, self-referenced base URL, generated setup token, RAILWAY_RUN_UID, overview headings'
