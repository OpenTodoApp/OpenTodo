// Suggestions for `#project` and `@label` while typing (OpenSpec change
// smart-title-tokens, design D1 and D2): which token the caret is in, the projects or
// labels that match it on any word of their name, and the token that picking one
// inserts, which the parser resolves to exactly that item. Pure.
import { foldName, matchProject, type ProjectRef } from './attributes'
import { findLabel, type LabelRef } from './quickadd'

/** The `#` or `@` token the caret is in, with the text typed after the symbol. */
export interface TokenAtCaret { kind: 'project' | 'label'; start: number; end: number; query: string }

/** The token at the caret, or null (no symbol at the word's start, or inside double quotes). */
export function tokenAtCaret(value: string, caret: number): TokenAtCaret | null {
  if (caret < 1 || caret > value.length) return null
  let start = caret
  while (start > 0 && !/\s/.test(value[start - 1])) start--
  const sym = value[start]
  if (sym !== '#' && sym !== '@') return null
  // An odd number of quotes before the token: it is quoted text.
  if ((value.slice(0, start).match(/"/g)?.length ?? 0) % 2 === 1) return null
  let end = caret
  while (end < value.length && !/\s/.test(value[end])) end++
  return { kind: sym === '#' ? 'project' : 'label', start, end, query: value.slice(start + 1, caret) }
}

/** A project to suggest: its path of ancestor names, and the token picking it inserts. */
export interface ProjectSuggestion { project: ProjectRef; path: string[]; token: string }
export interface LabelSuggestion { label: LabelRef; token: string }

const MAX = 8

/** 0 for an exact match, 1 for a name prefix, 2 for a word prefix, 3 for an ancestor's, -1 for none. */
function rank(name: string, ancestors: string[], q: string): number {
  if (!q) return 2
  const folded = foldName(name)
  if (folded === q) return 0
  if (folded.startsWith(q)) return 1
  if (name.split(/[\s_-]+/).some((w) => foldName(w).startsWith(q))) return 2
  if (ancestors.some((a) => foldName(a).startsWith(q))) return 3
  return -1
}

function pathOf(p: ProjectRef, byId: Map<string, ProjectRef>): ProjectRef[] {
  const out: ProjectRef[] = []
  const seen = new Set([p.id])
  let cur = p.parent_id ? byId.get(p.parent_id) : undefined
  while (cur && !seen.has(cur.id)) { out.unshift(cur); seen.add(cur.id); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined }
  return out
}

/** The token for a project: its name without spaces, or `#Parent/Child` when that alone would pick another. */
export function projectToken(p: ProjectRef, projects: readonly ProjectRef[]): string {
  const plain = `#${p.name.replace(/\s+/g, '')}`
  const live = projects.filter((x) => !x.archived && !x.deleted_at)
  // A name shared with another project always gets its path, so the pick does not hang on a tie-break.
  const shared = live.some((x) => x.id !== p.id && foldName(x.name) === foldName(p.name))
  if (!shared && matchProject(plain, projects)?.id === p.id) return plain
  const byId = new Map(live.map((x) => [x.id, x]))
  return `#${[...pathOf(p, byId), p].map((x) => x.name.replace(/\s+/g, '')).join('/')}`
}

/** Projects matching `query`, best first: exact, name prefix, any word, an ancestor's name. */
export function projectSuggestions(query: string, projects: readonly ProjectRef[]): ProjectSuggestion[] {
  const q = foldName(query)
  const live = projects.filter((p) => !p.archived && !p.deleted_at)
  const byId = new Map(live.map((p) => [p.id, p]))
  return live
    .map((p) => { const path = pathOf(p, byId); return { p, path, r: rank(p.name, path.map((a) => a.name), q) } })
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.path.length - b.path.length || a.p.name.localeCompare(b.p.name) || (a.p.id < b.p.id ? -1 : 1))
    .slice(0, MAX)
    .map(({ p, path }) => ({ project: p, path: path.map((a) => a.name), token: projectToken(p, projects) }))
}

/** The token for a label: its name with spaces as dashes, which `findLabel` folds back. */
export function labelToken(l: LabelRef): string {
  return `@${l.name.trim().replace(/\s+/g, '-')}`
}

/** Labels matching `query`, best first. */
export function labelSuggestions(query: string, labels: readonly LabelRef[]): LabelSuggestion[] {
  const q = foldName(query)
  return labels
    .filter((l) => !l.deleted_at)
    .map((l) => ({ l, r: rank(l.name, [], q) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.l.name.localeCompare(b.l.name))
    .slice(0, MAX)
    .map(({ l }) => ({ label: l, token: labelToken(l) }))
}

/** Whether the typed name is exactly an existing item (so no Create entry is offered). */
export function hasExact(kind: 'project' | 'label', query: string, projects: readonly ProjectRef[], labels: readonly LabelRef[]): boolean {
  if (!query.trim()) return true
  if (kind === 'label') return !!findLabel(query, labels)
  const q = foldName(query)
  return projects.some((p) => !p.archived && !p.deleted_at && foldName(p.name) === q)
}

/** Replaces the token with `token` and a space; returns the new value and the caret after it. */
export function insertToken(value: string, at: TokenAtCaret, token: string): { value: string; caret: number } {
  const after = value.slice(at.end).replace(/^\s*/, '')
  const next = `${value.slice(0, at.start)}${token} ${after}`
  return { value: next, caret: at.start + token.length + 1 }
}
