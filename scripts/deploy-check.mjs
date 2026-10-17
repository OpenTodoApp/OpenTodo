#!/usr/bin/env node
// Checks every platform template in deploy/<platform>/ (OpenSpec change unraid-template).
//
//   node scripts/deploy-check.mjs
//
// Each folder of deploy/ needs a checker, scripts/deploy/<folder>.mjs, exporting
// check(ctx) -> problems[] and a one-line summary. The checker parses its platform's
// format and applies the shared rules (scripts/deploy/common.mjs) against the facts in
// deploy/deploy.json. A folder without a checker fails the run. Coolify's Docker smoke
// test stays in `node scripts/coolify-template-check.mjs --smoke`.

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checkFacts, checkPublishesTag, configVariables, loadFacts, readText, ROOT } from './deploy/common.mjs'

export function platforms(root = ROOT) {
  return readdirSync(join(root, 'deploy')).filter((d) => statSync(join(root, 'deploy', d)).isDirectory()).sort()
}

export async function run(root = ROOT) {
  const facts = loadFacts(root)
  const configVars = configVariables(root)
  const ctx = { facts, configVars, changelog: readText('CHANGELOG.md', root) }
  const results = [{
    name: 'deploy/deploy.json',
    errors: [...checkFacts(facts, configVars), ...checkPublishesTag(readText('.github/workflows/ci.yml', root), facts)],
    summary: `variable catalogue, "${facts.tag}" tag published on releases`,
  }]
  for (const p of platforms(root)) {
    const checker = join(root, 'scripts/deploy', `${p}.mjs`)
    if (!existsSync(checker)) {
      results.push({ name: `deploy/${p}`, errors: [`no checker: add scripts/deploy/${p}.mjs (see deploy/README.md)`] })
      continue
    }
    const mod = await import(pathToFileURL(checker).href)
    results.push({ name: `deploy/${p}`, errors: mod.check(ctx, root), summary: mod.summary })
  }
  return results
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const results = await run()
  let failed = false
  for (const r of results) {
    if (r.errors.length) {
      failed = true
      console.error(`${r.name}: check failed`)
      for (const e of r.errors) console.error(`  - ${e}`)
    } else {
      console.log(`${r.name}: ${r.summary} ok`)
    }
  }
  if (failed) process.exit(1)
}
