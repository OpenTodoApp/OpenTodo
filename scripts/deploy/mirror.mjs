#!/usr/bin/env node
// Generates the byte-identical copies in deploy/ from their one source (M2 of the 2026-10 audit).
// deploy/<platform>/upstream/ holds the files a store's repository gets, at the paths they take
// there; most of them are copies of the template next to it, of the shared logo or of a file
// elsewhere in the repository. Edit the source, then run this; the platform checkers still compare
// each copy with its source, so a forgotten run fails `make deploy-check` as before.
//
//   node scripts/deploy/mirror.mjs           write every copy that differs from its source
//   node scripts/deploy/mirror.mjs --check   only list them, and fail when there are any
//
// Files that exist only in upstream/ (a store's own scripts, workflows, PR.md, the Home Assistant
// add-on, the Claude plugin manifest) have no source and are edited where they are.

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT } from './common.mjs'

const LOGO = 'deploy/coolify/opentodo.svg'

/** [source, copy] pairs, relative to the repository root. */
export const COPIES = [
  ['deploy/caprover/opentodo.yml', 'deploy/caprover/upstream/public/v4/apps/opentodo.yml'],
  ['web/public/pwa-512.png', 'deploy/caprover/upstream/public/v4/logos/opentodo.png'],
  ['deploy/casaos/docker-compose.yml', 'deploy/casaos/upstream/Apps/OpenTodo/docker-compose.yml'],
  [LOGO, 'deploy/casaos/upstream/Apps/OpenTodo/icon.svg'],
  ['LICENSE', 'deploy/claude-plugin/upstream/LICENSE'],
  ['skills/opentodo-cli/SKILL.md', 'deploy/claude-plugin/upstream/plugins/opentodo/skills/opentodo-cli/SKILL.md'],
  ['skills/opentodo-mcp/SKILL.md', 'deploy/claude-plugin/upstream/plugins/opentodo/skills/opentodo-mcp/SKILL.md'],
  ['deploy/coolify/opentodo.yaml', 'deploy/coolify/upstream/templates/compose/opentodo.yaml'],
  [LOGO, 'deploy/coolify/upstream/public/svgs/opentodo.svg'],
  [LOGO, 'deploy/coolify/upstream/coolify-docs/public/images/services/opentodo-logo.svg'],
  ['deploy/cosmos/cosmos-compose.json', 'deploy/cosmos/upstream/servapps/OpenTodo/cosmos-compose.json'],
  ['deploy/cosmos/description.json', 'deploy/cosmos/upstream/servapps/OpenTodo/description.json'],
  [LOGO, 'deploy/dokploy/blueprints/opentodo/opentodo.svg'],
  ...['docker-compose.yml', 'meta.json', 'opentodo.svg', 'template.toml'].map((f) => [`deploy/dokploy/blueprints/opentodo/${f}`, `deploy/dokploy/upstream/blueprints/opentodo/${f}`]),
  [LOGO, 'deploy/easypanel/assets/logo.svg'],
  ...['meta.yaml', 'index.ts', 'assets/logo.svg', 'assets/screenshot.png'].map((f) => [`deploy/easypanel/${f}`, `deploy/easypanel/upstream/templates/opentodo/${f}`]),
  ['LICENSE', 'deploy/homeassistant/upstream/LICENSE'],
  ...['config.json', 'docker-compose.yml', 'metadata/description.md', 'metadata/logo.jpg'].map((f) => [`deploy/runtipi/${f}`, `deploy/runtipi/upstream/apps/opentodo/${f}`]),
  ...['README.md', 'app.yaml', 'item.yaml', 'ix_values.yaml', 'questions.yaml', 'templates/docker-compose.yaml',
    'templates/test_values/basic-values.yaml', 'templates/test_values/hostnet-values.yaml']
    .map((f) => [`deploy/truenas/opentodo/${f}`, `deploy/truenas/upstream/ix-dev/community/opentodo/${f}`]),
  ...['docker-compose.yml', 'umbrel-app.yml'].map((f) => [`deploy/umbrel/${f}`, `deploy/umbrel/upstream/opentodo/${f}`]),
  ['deploy/unraid/opentodo.xml', 'deploy/unraid/upstream/templates/opentodo.xml'],
]

/** The copies that differ from (or lack) their source's bytes. */
export function staleCopies(root = ROOT) {
  return COPIES.filter(([src, dst]) => {
    const a = join(root, src)
    const b = join(root, dst)
    if (!existsSync(a)) throw new Error(`mirror: the source ${src} is missing`)
    return !existsSync(b) || !readFileSync(a).equals(readFileSync(b))
  })
}

/** Writes every stale copy; returns the pairs it wrote. A logo copied twice is written in source order. */
export function mirror(root = ROOT) {
  const stale = staleCopies(root)
  for (const [src, dst] of stale) {
    mkdirSync(dirname(join(root, dst)), { recursive: true })
    copyFileSync(join(root, src), join(root, dst))
  }
  // A copy that is also a source (dokploy's logo) may have changed above: one more pass settles it.
  const again = staleCopies(root)
  for (const [src, dst] of again) copyFileSync(join(root, src), join(root, dst))
  return [...stale, ...again]
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--check')) {
    const stale = staleCopies()
    for (const [src, dst] of stale) console.error(`${dst} differs from ${src}`)
    if (stale.length) {
      console.error('mirror: run node scripts/deploy/mirror.mjs to copy the sources')
      process.exit(1)
    }
    console.log(`mirror: ${COPIES.length} copies, all identical to their source`)
  } else {
    const wrote = mirror()
    for (const [src, dst] of wrote) console.log(`${src} → ${dst}`)
    if (!wrote.length) console.log(`mirror: ${COPIES.length} copies, all current`)
  }
}
