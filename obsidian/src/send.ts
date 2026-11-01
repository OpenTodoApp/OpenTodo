// "Send line to OpenTodo" (spec "Send a line or a selection to OpenTodo", "The
// task links back to its note", "Sends work offline"): read the lines, confirm,
// build and seal the ops, queue them, then change the lines, offer Undo and push.
// Everything Obsidian-specific comes in through Deps, so the flow is unit tested
// on an in-memory editor (send.test.ts).
import { applyChanges, lineAfter, linkedTasks, taskURL, undoChanges, type AfterSending, type LineChange, type LineEditor } from './after'
import type { Lists } from './cache'
import { MAX_LINES, readLine, selectedLines, type Draft, type ReadContext } from './capture'
import type { Account } from './connect'
import type { Keyring } from './crypt'
import type { Entry, Outbox } from './outbox'
import { noteOrigin, originOps, taskOps, trashOps, type Op } from './ops'
import type { SheetOptions } from './sheet'
import { K, type DeviceStorage } from './storage'
import { tr } from './strings'

export interface Settings {
  /** The project new tasks go to, or null for the Inbox. */
  defaultProject: string | null
  afterSending: AfterSending
  sendWithoutAsking: boolean
}

export const DEFAULT_SETTINGS: Settings = { defaultProject: null, afterSending: 'link', sendWithoutAsking: false }

export interface Action {
  label: string
  run: () => void
}

export interface Deps {
  store: DeviceStorage
  outbox: Outbox
  lists: Lists
  keys: Keyring
  device: string
  vault: () => string
  server: () => string | null
  account: () => Account | null
  settings: () => Settings
  confirm: (o: Omit<SheetOptions, 'onSend' | 'onCancel'>) => Promise<{ drafts: Draft[]; project: string | null } | null>
  notify: (message: string, actions?: Action[], ms?: number) => void
  openUrl: (url: string) => void
  openSettings: () => void
  unlock: () => void
  push: () => void
  /** The task's project, read from the server, for a rename on an encrypted account (null when unknown). */
  taskProject: (taskId: string) => Promise<string | null | undefined>
  now?: () => Date
}

/** Ten seconds to undo a send (D8). */
export const UNDO_MS = 10_000

const pad = (n: number) => String(n).padStart(2, '0')

export function readContext(account: Account, lists: Lists, language: string, now: Date): ReadContext {
  return {
    today: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, now: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    language, projects: lists.projects().map((p) => ({ id: p.id, name: p.name, parent_id: p.parent_id })), dayParts: account.dayParts, energy: account.energy,
  }
}

/** The sheet's project list, children under their parents. */
export function sheetProjects(lists: Lists): { id: string; name: string; depth: number }[] {
  const all = lists.projects()
  const ids = new Set(all.map((p) => p.id))
  const out: { id: string; name: string; depth: number }[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const p of all) {
      const top = p.parent_id === null || !ids.has(p.parent_id)
      if ((parent === null ? top : p.parent_id === parent) && !out.some((o) => o.id === p.id)) {
        out.push({ id: p.id, name: p.name, depth })
        if (depth < 8) walk(p.id, depth + 1)
      }
    }
  }
  walk(null, 0)
  return out
}

interface SentRecord {
  shared: boolean
  note: string
}

export class Sender {
  constructor(private d: Deps, private language: () => string) {}

  private now(): Date {
    return this.d.now?.() ?? new Date()
  }

  /** Locked or not connected: says so and returns false before anything is read or queued. */
  private ready(): Account | null {
    const account = this.d.account()
    if (!account || !this.d.server()) {
      this.d.notify(tr('Connect OpenTodo in the plugin settings first.'), [{ label: tr('Open settings'), run: () => this.d.openSettings() }])
      return null
    }
    if (account.encrypted && !this.d.keys.unlocked) {
      this.d.notify(tr('Your OpenTodo account is encrypted and locked on this device, so nothing was sent.'), [{ label: tr('Unlock OpenTodo'), run: () => this.d.unlock() }])
      return null
    }
    return account
  }

  /** The command on lines `from`…`to` of the note at `path`. */
  async sendLines(ed: LineEditor, path: string, from: number, to: number): Promise<string[]> {
    const account = this.ready()
    if (!account) return []
    const all = Array.from({ length: ed.lineCount() }, (_, i) => ed.getLine(i))
    const picked = selectedLines(all, from, to)
    if (picked.length === 0) {
      this.d.notify(tr('There is nothing to send on this line.'))
      return []
    }
    const ctx = readContext(account, this.d.lists, this.language(), this.now())
    const settings = this.d.settings()
    if (picked.length > MAX_LINES) {
      await this.d.confirm({ drafts: [], projects: sheetProjects(this.d.lists), project: settings.defaultProject, ctx, tooMany: picked.length })
      return []
    }
    const reads = picked.map((p) => readLine(p.index, p.line, ctx))
    const drafts = reads.flatMap((r) => (r.kind === 'draft' ? [r.draft] : []))
    if (drafts.length === 0) {
      const sent = reads.find((r) => r.kind === 'sent')
      if (sent && sent.kind === 'sent') {
        const url = sent.url
        this.d.notify(picked.length > 1 ? tr('These lines are already in OpenTodo.') : tr('This line is already in OpenTodo.'), url ? [{ label: tr('Open in OpenTodo'), run: () => this.d.openUrl(url) }] : [])
      } else this.d.notify(tr('There is nothing to send on this line.'))
      return []
    }
    let chosen: { drafts: Draft[]; project: string | null } | null = { drafts, project: settings.defaultProject }
    if (!settings.sendWithoutAsking) chosen = await this.d.confirm({ drafts, projects: sheetProjects(this.d.lists), project: settings.defaultProject, ctx })
    if (!chosen || chosen.drafts.length === 0) return []
    // The account may have been locked while the sheet was open.
    if (!this.ready()) return []
    return this.queue(ed, path, chosen.drafts, chosen.project, account, settings, ctx.today)
  }

  private async queue(ed: LineEditor, path: string, drafts: Draft[], project: string | null, account: Account, settings: Settings, today: string): Promise<string[]> {
    const server = this.d.server()!
    const origin = noteOrigin(this.d.vault(), path)
    const created = new Map<string, string>()
    const entries: Entry[] = []
    const changes: LineChange[] = []
    const known = new Set(this.d.lists.projects().map((p) => p.id))
    for (const draft of drafts) {
      const named = drafts.length > 1 && draft.fields.projectId && known.has(draft.fields.projectId) ? draft.fields.projectId : null
      const projectId = named ?? (project && known.has(project) ? project : null)
      const built = taskOps({ title: draft.title, fields: draft.fields, projectId, origin }, {
        device: this.d.device, userId: account.userId, labels: this.d.lists.labels(), createdLabels: created, now: this.now().getTime(), today,
      })
      let ops = built.ops
      const shared = this.d.lists.shared(projectId)
      if (account.encrypted) ops = await this.d.keys.seal(ops, (op) => personal(op, shared))
      entries.push({ id: crypto.randomUUID(), taskId: built.taskId, title: draft.title, note: path, project: projectId, ops })
      changes.push({ index: draft.index, before: draft.line, after: lineAfter(draft.line, settings.afterSending, taskURL(server, built.taskId), this.now()) })
    }
    // Queued before the note changes: a crash in between loses no task (D9).
    this.d.outbox.add(entries)
    this.remember(entries.map((e) => [e.taskId, { shared: this.d.lists.shared(e.project), note: path }]))
    applyChanges(ed, changes)
    const ids = entries.map((e) => e.taskId)
    const message = ids.length === 1 ? tr('Sent to OpenTodo') : tr('{n, plural, one {# task sent to OpenTodo} other {# tasks sent to OpenTodo}}', { n: ids.length })
    this.d.notify(message, [{ label: tr('Undo'), run: () => void this.undo(ed, changes, entries) }], UNDO_MS)
    this.d.push()
    return ids
  }

  /** Undo (D8): the lines read as before; tasks not yet pushed are dropped, the others go to the Trash. */
  async undo(ed: LineEditor, changes: LineChange[], entries: Entry[]): Promise<void> {
    const restored = undoChanges(ed, changes)
    const trash: Entry[] = []
    for (const e of entries) {
      if (this.d.outbox.drop(e.taskId)) continue
      trash.push({ id: crypto.randomUUID(), taskId: e.taskId, title: e.title, note: e.note, project: e.project, ops: trashOps(e.taskId, this.d.device) })
    }
    if (trash.length) this.d.outbox.add(trash)
    this.d.notify(restored ? tr('Undone: the lines are back and the tasks are in the Trash.') : tr('Undone, but a line had changed and was left as it is.'))
    this.d.push()
  }

  private remember(records: [string, SentRecord][]): void {
    const sent = this.d.store.get<Record<string, SentRecord>>(K.sent) ?? {}
    for (const [id, r] of records) sent[id] = r
    // Bounded: the newest 5,000 sends are enough to repair renames.
    const keys = Object.keys(sent)
    for (const k of keys.slice(0, Math.max(0, keys.length - 5000))) delete sent[k]
    this.d.store.set(K.sent, sent)
  }

  /**
   * A note was renamed or moved (D11), or "Fix OpenTodo links in this note" ran:
   * each task linked from its lines gets an origin naming `path`. Returns how
   * many were queued.
   */
  async relink(path: string, text: string, opts: { quiet?: boolean } = {}): Promise<number> {
    const server = this.d.server()
    const account = this.d.account()
    if (!server || !account) {
      if (!opts.quiet) this.ready()
      return 0
    }
    const ids = linkedTasks(text, server)
    if (ids.length === 0) {
      if (!opts.quiet) this.d.notify(tr('This note has no lines linked to OpenTodo.'))
      return 0
    }
    if (account.encrypted && !this.d.keys.unlocked) {
      this.d.notify(tr('Your OpenTodo account is encrypted and locked on this device, so the links were not updated.'), [{ label: tr('Unlock OpenTodo'), run: () => this.d.unlock() }])
      return 0
    }
    const origin = noteOrigin(this.d.vault(), path)
    const sent = this.d.store.get<Record<string, SentRecord>>(K.sent) ?? {}
    const entries: Entry[] = []
    let unknown = 0
    for (const id of ids) {
      let ops: Op[] = originOps(id, origin, this.d.device)
      if (account.encrypted) {
        let shared = sent[id]?.shared
        if (shared === undefined) {
          const project = await this.d.taskProject(id).catch(() => undefined)
          if (project === undefined) {
            unknown++
            continue
          }
          shared = this.d.lists.shared(project)
        }
        ops = await this.d.keys.seal(ops, () => !shared)
      }
      entries.push({ id: crypto.randomUUID(), taskId: id, title: '', note: path, project: null, ops })
      if (sent[id]) sent[id] = { ...sent[id], note: path }
    }
    this.d.store.set(K.sent, sent)
    if (entries.length) this.d.outbox.add(entries)
    if (unknown) this.d.notify(tr('{n, plural, one {# linked task} other {# linked tasks}} could not be updated while offline. Run "Fix OpenTodo links in this note" again later.', { n: unknown }))
    else if (!opts.quiet) this.d.notify(tr('{n, plural, one {# link updated} other {# links updated}}', { n: entries.length }))
    this.d.push()
    return entries.length
  }
}

/** Personal scope: labels and time entries always, a task unless its project is shared. */
function personal(op: Op, shared: boolean): boolean {
  return op.entity === 'task' ? !shared : true
}
