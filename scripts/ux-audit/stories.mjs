// Story coverage of the core screens (M14, OpenSpec change ux-audit-three-widths
// task 3.4; design-system "Core screens in the workbench"): every inventory entry
// marked core names a story title that exists in web/src/**/*.stories.tsx. Rare
// screens without a story are listed, never failed.
//
//   node scripts/ux-audit/stories.mjs      exits 1 naming each core screen without its story
import { pathToFileURL } from 'node:url'
import { inventory, storyTitles } from './inventory.mjs'

/** `missing`: core entries whose story does not exist; `uncoveredRare`: rare ones without a story. */
export function coverage(entries = inventory(), titles = storyTitles()) {
  const missing = entries.filter((e) => e.core && !titles.has(e.story)).map((e) => ({ id: e.id, story: e.story ?? null }))
  const uncoveredRare = entries.filter((e) => !e.core && (!e.story || !titles.has(e.story))).map((e) => ({ id: e.id, story: e.story ?? null }))
  return { missing, uncoveredRare }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { missing, uncoveredRare } = coverage()
  console.log(`story coverage: ${uncoveredRare.length} rare screens without a story (not a failure)`)
  if (missing.length) {
    for (const m of missing) console.error(`  core screen "${m.id}" has no story "${m.story}"`)
    console.error(`✗ ${missing.length} core screens without a story`)
    process.exit(1)
  }
  console.log('story coverage OK')
}
