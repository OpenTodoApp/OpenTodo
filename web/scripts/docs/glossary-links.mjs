// Links the first prose use of every glossary abbreviation on each docs page to the
// glossary (OpenSpec accessibility "Glossary and reading level"; accessibility-aaa D11).
//
//   node scripts/docs/glossary-links.mjs            (from web/: list the pages that would change)
//   node scripts/docs/glossary-links.mjs --write    (rewrite them)
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { glossaryTerms, linkGlossaryTerms, listMarkdown, repoRootFrom } from './lib.mjs'

const repoRoot = repoRootFrom(new URL(import.meta.url).pathname)
const docs = join(repoRoot, 'docs')
const terms = glossaryTerms(readFileSync(join(docs, 'glossary.md'), 'utf8'))
const write = process.argv.includes('--write')
let changed = 0
for (const rel of listMarkdown(docs)) {
  const file = join(docs, rel)
  if (rel === 'glossary.md' || rel === 'README.md') continue
  const src = readFileSync(file, 'utf8')
  const fm = /^---\n[\s\S]*?\n---\n/.exec(src)
  const head = fm ? fm[0] : ''
  const body = src.slice(head.length)
  // The glossary sits beside the page, or one folder up for pages in a sub-folder.
  const href = rel.includes('/') ? `${'../'.repeat(rel.split('/').length - 1)}glossary.md` : 'glossary.md'
  const next = linkGlossaryTerms(body, terms, href)
  if (next === body) continue
  changed++
  console.log(`${write ? 'linked' : 'would link'}: docs/${rel}`)
  if (write) writeFileSync(file, head + next)
}
console.log(`glossary-links: ${changed} page(s)${write ? ' rewritten' : ' to rewrite (add --write)'}`)
