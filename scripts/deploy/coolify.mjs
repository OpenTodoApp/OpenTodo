// Coolify one-click template (deploy/coolify/), OpenSpec changes coolify-template and
// unraid-template: the Coolify-specific checks in scripts/coolify-template-check.mjs,
// plus the rules every platform template shares.

import { checkTemplate as checkCoolify, loadInputs, parseYaml, PATHS } from '../coolify-template-check.mjs'
import { checkShared, ROOT } from './common.mjs'

/** What the shared rules need, read from the compose template. */
export function readFound(template) {
  const svc = parseYaml(template).services?.opentodo ?? {}
  const variables = new Map()
  let port = null
  for (const entry of svc.environment ?? []) {
    if (typeof entry !== 'string') continue
    const eq = entry.indexOf('=')
    const name = eq < 0 ? entry : entry.slice(0, eq)
    const value = eq < 0 ? null : entry.slice(eq + 1)
    const m = /^SERVICE_URL_OPENTODO_(\d+)$/.exec(name)
    if (m) port = m[1]
    if (!name.startsWith('OPENTODO_')) continue
    const d = value === null ? null : new RegExp(`^\\$\\{${name}:-(.*)\\}$`).exec(value)
    variables.set(name, { default: d ? d[1] : value, required: /\$\{[^}]*:?\?/.test(value ?? '') })
  }
  const vol = (svc.volumes ?? []).find((v) => typeof v === 'string' && v.startsWith('opentodo-data:'))
  return { image: svc.image, port, dataTarget: vol ? vol.slice('opentodo-data:'.length) : null, variables }
}

export function check(ctx, root = ROOT) {
  const input = loadInputs(root)
  const errors = checkCoolify(input)
  if (!input.template) return errors
  let found
  try {
    found = readFound(input.template)
  } catch {
    return errors // the Coolify check already reported the parse error
  }
  // The Coolify check owns the image tag message (it names the upstream copy too).
  const shared = checkShared(found, ctx).filter((e) => !/^image /.test(e))
  return [...errors, ...shared.filter((e) => !errors.includes(e))]
}

export const summary = `conventions, stable tag, variables, health check, volume, logo and upstream copies (${PATHS.template})`
