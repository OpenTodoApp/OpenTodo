// The in-app Help (OpenSpec change `user-documentation`, design D5): the user guide
// of this version, generated from docs/ by `make docs` into generated/help.json.
// It is part of the lazy Help chunk, loaded only when Help opens, and precached by
// the service worker like every other chunk, so it works offline.
import data from '../generated/help.json'
import { prepare, search, type SearchEntry, type SearchIndex, type SearchResult } from '../../scripts/docs/search-core.mjs'

export interface HelpPage {
  slug: string
  title: string
  summary: string
  section: string
  order: number
  toc: { id: string; text: string }[]
  html: string
}

export interface HelpBundle {
  version: string
  pages: HelpPage[]
  /** Contextual help: screen id → page and section (from each page's `screens`). */
  screens: Record<string, { page: string; anchor: string }>
  index: SearchIndex
}

let prepared: { bundle: HelpBundle; entries: SearchEntry[] } | null = null

/**
 * The help bundle with its search index. This module is only imported by the lazy
 * Help chunk (app/help/lazy.ts), so the guide text arrives with it; keeping the
 * JSON a static import avoids a second, nested dynamic import.
 */
export function loadHelp(): Promise<{ bundle: HelpBundle; entries: SearchEntry[] }> {
  if (!prepared) {
    const bundle = data as unknown as HelpBundle
    prepared = { bundle, entries: prepare(bundle.index) }
  }
  return Promise.resolve(prepared)
}

/** The guide sections, in order, with their pages. */
export function helpSections(bundle: HelpBundle): { title: string; pages: HelpPage[] }[] {
  const out: { title: string; pages: HelpPage[] }[] = []
  for (const p of bundle.pages) {
    const s = out.find((x) => x.title === p.section)
    if (s) s.pages.push(p)
    else out.push({ title: p.section, pages: [p] })
  }
  return out
}

/** Search results; `url` is "<slug>#<anchor>". */
export function searchHelp(entries: SearchEntry[], query: string, limit = 8): SearchResult[] {
  return search(entries, query, limit)
}

/** Page for a `:help <topic>` argument: an exact slug, else the first slug or title starting with it. */
export function findTopic(bundle: HelpBundle, topic: string): HelpPage | undefined {
  const t = topic.trim().toLowerCase()
  if (!t) return undefined
  return bundle.pages.find((p) => p.slug === t)
    ?? bundle.pages.find((p) => p.slug.startsWith(t) || p.title.toLowerCase().startsWith(t))
    ?? bundle.pages.find((p) => p.title.toLowerCase().includes(t))
}
