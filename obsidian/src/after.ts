// What happens to a line once its task is queued (obsidian-plugin D8): by default
// it keeps its text and gains `[opentodo:: <server>/?task=<id>]`; by setting it is
// ticked or removed instead. Undo puts every changed line back exactly.

export type AfterSending = 'link' | 'done' | 'remove'

/** The few editor calls the plugin needs; Obsidian's Editor has them all. */
export interface LineEditor {
  getLine(n: number): string
  lineCount(): number
  replaceRange(text: string, from: { line: number; ch: number }, to?: { line: number; ch: number }): void
}

export interface LineChange {
  index: number
  before: string
  /** The line now, or null when it was removed. */
  after: string | null
}

/** The address a task opens at in the web app, the one the shells open too. */
export function taskURL(server: string, taskId: string): string {
  return `${server}/?task=${encodeURIComponent(taskId)}`
}

/** The task id of a link the plugin wrote, when it points at this server. */
export function taskIdOf(link: string, server?: string): string | null {
  try {
    const u = new URL(link)
    if (server && !link.startsWith(server + '/')) return null
    return u.searchParams.get('task')
  } catch {
    return null
  }
}

const CHECKBOX = /^([ \t]*[-*] )\[[ xX]\]/
const BULLET = /^([ \t]*)(?:[-*+]|\d{1,9}[.)])[ \t]+/
/** Obsidian Tasks markers: a line using them gets Tasks' own done date. */
const TASKS_FIELDS = /📅|🛫|⏳|➕|🔁|🔺|⏫|🔼|🔽|⏬/

function today(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** The line after sending, or null when it goes. */
export function lineAfter(line: string, mode: AfterSending, url: string, now = new Date()): string | null {
  if (mode === 'remove') return null
  const body = line.replace(/\s+$/, '')
  if (mode === 'link') return `${body} [opentodo:: ${url}]`
  const done = TASKS_FIELDS.test(body) && !/✅/.test(body) ? ` ✅ ${today(now)}` : ''
  if (CHECKBOX.test(body)) return body.replace(CHECKBOX, '$1[x]') + done
  const m = BULLET.exec(body)
  if (m) return `${m[1]}- [x] ${body.slice(m[0].length)}${done}`
  return `- [x] ${body}${done}`
}

/** Applies the changes, last line first so earlier indexes stay right. */
export function applyChanges(ed: LineEditor, changes: LineChange[]): void {
  for (const c of [...changes].sort((a, b) => b.index - a.index)) {
    if (c.after === null) {
      const last = ed.lineCount() - 1
      if (c.index < last) ed.replaceRange('', { line: c.index, ch: 0 }, { line: c.index + 1, ch: 0 })
      else if (c.index > 0) ed.replaceRange('', { line: c.index - 1, ch: ed.getLine(c.index - 1).length }, { line: c.index, ch: ed.getLine(c.index).length })
      else ed.replaceRange('', { line: 0, ch: 0 }, { line: 0, ch: ed.getLine(0).length })
    } else {
      ed.replaceRange(c.after, { line: c.index, ch: 0 }, { line: c.index, ch: ed.getLine(c.index).length })
    }
  }
}

/**
 * Undo: every changed line reads as before, first line first, so a removed line
 * goes back where it was. A line edited meanwhile is found by its text; a line
 * that can no longer be found is reported (false).
 */
export function undoChanges(ed: LineEditor, changes: LineChange[]): boolean {
  let ok = true
  for (const c of [...changes].sort((a, b) => a.index - b.index)) {
    if (c.after === null) {
      if (ed.lineCount() === 1 && ed.getLine(0) === '') ed.replaceRange(c.before, { line: 0, ch: 0 })
      else if (c.index < ed.lineCount()) ed.replaceRange(c.before + '\n', { line: c.index, ch: 0 })
      else ed.replaceRange('\n' + c.before, { line: ed.lineCount() - 1, ch: ed.getLine(ed.lineCount() - 1).length })
      continue
    }
    let at = c.index < ed.lineCount() && ed.getLine(c.index) === c.after ? c.index : -1
    for (let i = 0; at < 0 && i < ed.lineCount(); i++) if (ed.getLine(i) === c.after) at = i
    if (at < 0) {
      ok = false
      continue
    }
    ed.replaceRange(c.before, { line: at, ch: 0 }, { line: at, ch: ed.getLine(at).length })
  }
  return ok
}

/** The tasks a note links to: the ids in its `[opentodo:: …]` fields that point at this server. */
export function linkedTasks(text: string, server: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/\[opentodo::[ \t]*([^\]\s]+)[ \t]*\]/g)) {
    const id = taskIdOf(m[1], server)
    if (id && !out.includes(id)) out.push(id)
  }
  return out
}
