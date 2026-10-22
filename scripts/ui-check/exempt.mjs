// Exemption lists of the UI check (OpenSpec accessibility "Pointer targets", "Focus is
// never obscured"; design-system "Focus visibility in the accessibility gate"): each
// list holds the elements the first run of a pass found, with a dated reason, and may
// only shrink as follow-ups fix them. A failure is exempt when its element description
// starts with a listed entry.
import { readFileSync } from 'node:fs'

/** Reads a list file: `{ reason, elements }`. */
export function readExempt(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** Problems with a list's shape: a dated reason, unique non-empty entries. */
export function exemptProblems(list, name) {
  const out = []
  if (typeof list.reason !== 'string' || !/\d{4}-\d{2}-\d{2}/.test(list.reason)) out.push(`${name}: reason must say when the first run was (a date)`)
  if (!Array.isArray(list.elements)) return [...out, `${name}: elements must be a list`]
  const seen = new Set()
  for (const e of list.elements) {
    if (typeof e !== 'string' || !e.trim()) out.push(`${name}: an entry is empty`)
    else if (seen.has(e)) out.push(`${name}: "${e}" is listed twice`)
    seen.add(e)
  }
  return out
}

/** Splits failures into the ones a list exempts and the ones that stand. */
export function applyExempt(list, failures, elementOf = (f) => f.element) {
  const exempt = [], kept = []
  for (const f of failures) (list.elements.some((e) => elementOf(f).startsWith(e)) ? exempt : kept).push(f)
  return { exempt, kept }
}
