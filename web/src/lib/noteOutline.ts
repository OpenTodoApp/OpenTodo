// A note's outline (OpenSpec change note-outline): the top-level headings of levels 1
// to 3 of the editor's document, in order (D1), and which one the reader is at (D3).
// Pure functions over the ProseMirror document; nothing is stored.
import type { Node as PMNode } from 'prosemirror-model'

/** One heading of the outline: its level, its plain text and where the node starts. */
export interface OutlineItem {
  level: 1 | 2 | 3
  text: string
  pos: number
}

/** A note shows its outline from this many headings on (D1). */
export const OUTLINE_MIN = 3

/** The top-level headings of levels 1 to 3 (not those in quotes, lists or tables). */
export function outlineOf(doc: PMNode): OutlineItem[] {
  const out: OutlineItem[] = []
  doc.forEach((node, offset) => {
    if (node.type.name !== 'heading') return
    const level = Number(node.attrs.level)
    if (level >= 1 && level <= 3) out.push({ level: level as OutlineItem['level'], text: node.textContent.trim(), pos: offset })
  })
  return out
}

/** Whether two outlines read the same (level and text; positions move with every keystroke). */
export function sameOutline(a: readonly Pick<OutlineItem, 'level' | 'text'>[], b: readonly Pick<OutlineItem, 'level' | 'text'>[]): boolean {
  return a.length === b.length && a.every((x, i) => x.level === b[i].level && x.text === b[i].text)
}

/**
 * The current heading (D3): the last one whose top is above `line` (25 % of the
 * scroller's height, measured from its top); -1 while every heading is below it.
 */
export function currentHeading(tops: readonly number[], line: number): number {
  let at = -1
  for (let i = 0; i < tops.length; i++) {
    if (tops[i] <= line) at = i
    else break
  }
  return at
}

/** The next index for an outline key (D4), or null for a key the outline does not use. */
export function outlineStep(key: string, at: number, count: number): number | null {
  if (count === 0) return null
  if (key === 'ArrowDown') return Math.min(count - 1, at + 1)
  if (key === 'ArrowUp') return Math.max(0, at - 1)
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}
