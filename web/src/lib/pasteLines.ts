// A pasted list as task titles (OpenSpec change paste-to-tasks, design D2): one
// title per non-empty line, without the list marker in front. Pure; the server never
// splits pastes, so there is no Go twin.

/** The most lines one paste turns into tasks (design D6); longer lists go to Import. */
export const MAX_PASTED_LINES = 100

// One leading marker: a checkbox (Markdown `[ ]`/`[x]`, optionally after a bullet, or
// a ballot box), a bullet, or a number or letter followed by `.` or `)`. The marker
// must stand alone: "-5 degrees" and "1.5 kg" keep their first characters.
const MARKER = /^(?:[-*+•‣◦]\s+)?\[[ xX]\](?=\s|$)|^[☐☑☒](?=\s|$)|^[-*+•‣◦](?=\s|$)|^(?:\d{1,3}|[a-zA-Z])[.)](?=\s|$)/u

/** Cleans one line: trimmed, one leading list marker removed, runs of whitespace as one space. */
export function cleanPastedLine(line: string): string {
  const trimmed = line.trim()
  return trimmed.replace(MARKER, '').replace(/\s+/g, ' ').trim()
}

/**
 * Splits pasted text into task titles: `\r\n`, `\n` or `\r` end a line; blank lines
 * and lines holding only a marker are dropped. A checked box is not kept (the task
 * starts open).
 */
export function splitPastedLines(text: string): string[] {
  const out: string[] = []
  for (const line of text.split(/\r\n|\n|\r/)) {
    const clean = cleanPastedLine(line)
    if (clean) out.push(clean)
  }
  return out
}

/** "Paste as one line": the lines joined by spaces, as a browser flattens a paste into a single-line field. */
export function joinPastedLines(text: string): string {
  return text.split(/\r\n|\n|\r/).map((l) => l.trim()).filter(Boolean).join(' ')
}
