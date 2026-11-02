// One sync of a vault folder: the TypeScript twin of internal/vault (engine.go,
// exchange.go, plan.go), pinned to it by internal/vault/testdata/sync
// (OpenSpec change obsidian-vault-sync, design D1, D2). It reads and writes
// through a FileAdapter, exchanges through a Transport and never imports
// Obsidian. TaskNotes is not ported: a folder with one linked is refused.
import { isContentField } from '../../../web/src/lib/e2eeEnvelope'
import type { Entity } from '../../../web/src/lib/types'
import { nameId } from '../../../web/src/lib/ids'
import { isTaskLine, type Doc } from './doc'
import { goJSON, hashOf, opID, own, short, sortedKeys, utf8 } from './gojson'
import { merge } from './merge'
import { plan } from './plan'
import { checkOwner, loadState, LEASE_MS, randomDevice, saveState, takeOver } from './state'
import * as S from './store'
import { LimitError, TaskNotesError, type Event, type Options, type Reply, type Report, type Request, type State } from './types'
import { isCiphertext, View } from './view'
import { localDateTime } from './zone'

export const MAX_FILE_BYTES = 1 << 20
export const MAX_FILE_LINES = 5000
export const MAX_TASKS = 20000
export const MAX_NOTE_BYTES = 64 << 10

/** The protocol additions the vault handles. */
const FEATURES = ['clock_skew', 'backfill_ack']

/** A pending value of a field: what the Go engine keeps in its map[string]any bodies. */
export type Body = Map<string, unknown>

export class Engine {
  st: State
  rep: Report = { written: 0, created: 0, updated: 0, trashed: 0, conflicts: 0, warnings: [], cursor: 0, events: [], projects: 0, tasks: 0 }
  base: S.Store
  app: S.Store
  startCursor: number
  reseed: S.Op[] = []
  refused = new Set<string>()
  stamped = new Map<string, number>()
  disk = new Map<string, string>()
  changed = new Set<string>()
  parsed = new Map<string, Doc>()
  fileOf = new Map<string, string>()
  skip = new Set<string>()
  bodies = new Map<string, Map<string, Body>>()
  order: string[] = []
  fresh = new Set<string>()
  conf = new Map<string, string[]>()
  ops: S.Op[] = []
  retouch = new Set<string>()
  takeOver = false
  pending = new Set<string>()
  /** Plaintext of ciphertext values: entity\0id\0field\0value → text, null when it does not open. */
  plain: Map<string, string | null>

  constructor(public o: Options, st: State) {
    this.st = st
    this.base = st.store
    this.app = S.clone(st.store)
    this.startCursor = st.cursor
    this.plain = o.plain ?? new Map<string, string | null>()
  }

  event(kind: string, file: string, task: string, text: string): void {
    const ev: Event = { kind, text: '' }
    if (file) ev.file = file
    if (task) ev.task = task
    ev.text = text
    this.rep.events.push(ev)
  }

  warn(text: string): void {
    this.rep.warnings.push(text)
  }

  nowMS(): number {
    return this.o.now()
  }

  sharedSet(): Set<string> {
    return new Set(this.st.shared ?? [])
  }

  view(s: S.Store): View {
    return new View(s, this.o.crypter ? (e, id, f, v) => this.plain.get(`${e}\0${id}\0${f}\0${v}`) ?? null : null, this.o.zone, this.sharedSet())
  }

  /** A task's sharing scope: its project when shared, else private. */
  scopeOf(project: string): string {
    return (this.st.shared ?? []).includes(project) ? project : ''
  }

  /** The id of an entity the vault creates, derived from what made it (design D6). */
  newID(kind: string, ...parts: string[]): string {
    return nameId('vault-' + kind, `${this.st.device}\x00${this.startCursor}\x00${parts.join('\x00')}`)
  }

  /** The pending field values of an entity, creating it. */
  body(entity: string, id: string): Body {
    let byID = this.bodies.get(entity)
    if (!byID) this.bodies.set(entity, (byID = new Map<string, Body>()))
    let b = byID.get(id)
    if (!b) {
      byID.set(id, (b = new Map<string, unknown>()))
      this.order.push(`${entity}:${id}`)
    }
    return b
  }

  peek(entity: string, id: string): Body | undefined {
    return this.bodies.get(entity)?.get(id)
  }

  /** Appends a file line to the file's conflict file (D7). */
  conflict(p: string, raw: string, what: string): void {
    const cp = p.replace(/\.md$/, '') + '.conflict.md'
    const when = localDateTime(this.nowMS(), this.o.zone)
    const lines = this.conf.get(cp) ?? []
    lines.push(`## ${what}, ${when}`, '', raw.replace(/^[ \t]+/, ''), '')
    this.conf.set(cp, lines)
    this.rep.conflicts++
    this.event('conflict', cp, '', `conflict in ${p} (${what}); the file's line is in ${cp}`)
  }

  // ---- clock (exchange.go) ----

  next(): number {
    let t = this.nowMS() + this.st.offset
    if (t <= this.st.clock) t = this.st.clock + 1
    this.st.clock = t
    return t
  }

  receive(ts: number): void {
    if (ts > this.st.clock) this.st.clock = ts
  }

  observe(serverTime: number | undefined): void {
    if (!serverTime || serverTime <= 0) return
    const skew = serverTime - this.nowMS()
    this.st.offset = skew > 2000 || skew < -2000 ? skew : 0
    if (this.st.clock > serverTime + 5 * 60 * 1000) this.st.clock = serverTime
  }

  // ---- decryption ----

  /** Opens every ciphertext value of a store the run has not opened yet. */
  async openAll(s: S.Store): Promise<void> {
    const c = this.o.crypter
    if (!c) return
    for (const entity of Object.keys(s)) {
      for (const id of Object.keys(s[entity])) {
        const row = s[entity][id]
        for (const field of Object.keys(row)) {
          const v = row[field].v
          if (typeof v !== 'string' || !isCiphertext(v)) continue
          const key = `${entity}\0${id}\0${field}\0${v}`
          if (this.plain.has(key)) continue
          try {
            this.plain.set(key, await c.open(entity, id, field, v))
          } catch {
            this.plain.set(key, null)
          }
        }
      }
    }
  }

  // ---- exchange (exchange.go) ----

  request(ops: S.Op[]): Request {
    const req: Request = { device: this.st.device, cursor: this.st.cursor, ops, features: FEATURES }
    if (this.st.backfill_ack) req.backfillAck = this.st.backfill_ack
    return req
  }

  async pull(): Promise<void> {
    for (;;) {
      const rep = await this.o.transport.exchange(this.request([]))
      if (this.generation(rep)) continue
      this.absorb(rep)
      if (!rep.hasMore) return
    }
  }

  /** After a restore the vault pulls again from zero and re-sends what it knew (docs/sync.md "Log generation"). */
  generation(rep: Reply): boolean {
    const gen = rep.generation ?? ''
    const mine = this.st.generation ?? ''
    if (gen === '' || mine === '' || gen === mine) {
      if (mine === '') this.st.generation = gen
      return false
    }
    this.st.generation = gen
    this.st.cursor = 0
    this.st.backfill_ack = 0
    for (const entity of sortedKeys(this.base)) {
      const byID = this.base[entity]
      for (const id of sortedKeys(byID)) {
        const row = byID[id]
        for (const field of sortedKeys(row)) {
          const f = row[field]
          this.reseed.push({ id: opID(this.st.device, entity, id, field, 'reseed:' + gen, goJSON(f.v)), entity, entityId: id, field, value: f.v, ts: f.t, device: f.d })
        }
      }
    }
    this.app = {}
    this.warn('the server was restored from a backup; the vault is syncing again from the start')
    return true
  }

  absorb(rep: Reply): void {
    for (const op of rep.ops ?? []) {
      S.apply(this.app, op)
      this.receive(op.ts)
    }
    for (const p of rep.purged ?? []) S.purge(this.app, p.entity, p.entityId)
    if (rep.backfillSeq && rep.backfillSeq > 0) this.st.backfill_ack = rep.backfillSeq
    else this.st.cursor = rep.cursor
    this.st.shared = (rep.memberships ?? []).map((m) => m.projectId)
    this.observe(rep.serverTime)
  }

  /** Sends ops in batches, re-stamping ops refused for clock skew (docs/sync.md "Clocks"). */
  async push(ops: S.Op[]): Promise<void> {
    while (ops.length > 0) {
      let batch = ops.slice(0, 500)
      ops = ops.slice(500)
      for (let attempt = 0; ; attempt++) {
        let rep = await this.o.transport.exchange(this.request(batch))
        this.absorb(rep)
        const skewed: S.Op[] = []
        const byID = new Map(batch.map((op) => [op.id, op]))
        for (const r of rep.rejected ?? []) {
          const op = byID.get(r.id)
          if (!op) continue
          if (r.reason === 'clock_skew') {
            skewed.push(op)
            continue
          }
          this.warn(`the server refused the ${op.field} of ${op.entity} ${short(op.entityId)} (${r.reason})`)
          this.refused.add(op.id)
        }
        while (rep.hasMore) {
          rep = await this.o.transport.exchange(this.request([]))
          this.absorb(rep)
        }
        if (skewed.length === 0 || attempt >= 3) break
        const stamps = new Map<number, number>()
        batch = skewed.map((op) => {
          let ts = stamps.get(op.ts)
          if (ts === undefined) {
            ts = this.next()
            stamps.set(op.ts, ts)
          }
          this.stamped.set(op.id, ts)
          return { ...op, ts }
        })
      }
    }
  }

  // ---- build (plan.go) ----

  /** The pending values as ops, one timestamp per entity; content sealed for an encrypted account outside shared projects. */
  async build(): Promise<S.Op[]> {
    const ops: S.Op[] = []
    for (const key of this.order) {
      const i = key.indexOf(':')
      const entity = key.slice(0, i)
      const id = key.slice(i + 1)
      const b = this.peek(entity, id)
      if (!b || b.size === 0) continue
      const ts = this.next()
      for (const f of sortedKeys(b)) {
        const value = b.get(f)
        const base = S.get(this.base, entity, id)?.[f]
        const baseText = `${base ? goJSON(base.v) : ''}@${base ? base.t : 0}@${base ? base.d : ''}`
        const oid = opID(this.st.device, entity, id, f, baseText, this.fresh.has(key) ? null : goJSON(value))
        let out = value
        if (typeof value === 'string' && this.sealing(entity, id, f, b)) {
          try {
            const sealed = await this.o.crypter!.seal(entity, id, f, value)
            this.plain.set(`${entity}\0${id}\0${f}\0${sealed}`, value)
            out = sealed
          } catch {
            this.warn(`could not encrypt the ${f} of ${entity} ${short(id)}; it is not sent`)
            continue
          }
        }
        ops.push({ id: oid, entity, entityId: id, field: f, value: out, ts, device: this.st.device })
      }
    }
    return ops
  }

  sealing(entity: string, id: string, field: string, b: Body): boolean {
    if (!this.o.crypter || !isContentField(entity as Entity, field)) return false
    let project = ''
    if (entity === 'project') project = id
    else if (entity === 'task' || entity === 'section') {
      project = S.str(S.get(this.app, entity, id), 'project_id')
      const p = b.get('project_id')
      if (typeof p === 'string') project = p
    } else if (entity === 'time_entry') {
      let task = S.str(S.get(this.app, entity, id), 'task_id')
      const t = b.get('task_id')
      if (typeof t === 'string') task = t
      project = S.str(S.get(this.app, 'task', task), 'project_id')
      const p = this.peek('task', task)?.get('project_id')
      if (typeof p === 'string') project = p
    }
    return this.scopeOf(project) === ''
  }

  // ---- scan (engine.go) ----

  async scan(): Promise<void> {
    const files = this.o.files
    const all = await files.list()
    const onDisk = new Set(all)
    const paths = all.filter(vaultFile).sort()
    for (const p of paths) {
      const text = await files.read(p)
      if (text !== null) this.disk.set(p, text)
    }
    for (const p of sortedKeys(this.st.files)) {
      if (this.disk.has(p)) continue
      if (onDisk.has(icloudPlaceholder(p))) {
        this.pending.add(p)
        this.event('skipped', p, '', `skipped ${p}: it is not downloaded to this device yet`)
      }
    }
    for (const p of sortedKeys(this.disk)) {
      const text = this.disk.get(p)!
      const fs = own(this.st.files, p) ? this.st.files[p] : undefined
      if (fs && fs.hash === hashOf(text)) continue
      if (utf8(text).length > MAX_FILE_BYTES) throw new LimitError(`${p} is larger than 1 MB, the limit for a vault file`)
      let lines = 0
      for (const l of text.split('\n')) if (isTaskLine(l)) lines++
      if (lines > MAX_FILE_LINES) throw new LimitError(`${p} holds ${lines} task lines; the limit for a vault file is ${MAX_FILE_LINES}`)
      this.changed.add(p)
    }
  }

  /** The app becomes the base, except the rows of files a read-only run or a missing download left pending. */
  saveBase(): void {
    const next = S.clone(this.app)
    const pendingFile = new Set(this.pending)
    if (this.o.readOnly) for (const p of this.changed) pendingFile.add(p)
    const keep = (entity: string, id: string) => {
      const row = S.get(this.base, entity, id)
      if (row === undefined) return
      next[entity] ??= {}
      next[entity][id] = row
    }
    for (const id of Object.keys(this.st.printed)) if (pendingFile.has(this.st.printed[id])) keep('task', id)
    for (const p of pendingFile) {
      const fs = own(this.st.files, p) ? this.st.files[p] : undefined
      if (fs && fs.project !== '') keep('project', fs.project)
    }
    this.st.store = next
  }

  /** The tasks the vault prints: open tasks of live projects and the Inbox, and completed ones that keep their line. */
  countTasks(s: S.Store): number {
    const v = new View(s, null, 'UTC', new Set())
    let n = 0
    for (const id of S.ids(s, 'task')) {
      const r = S.get(s, 'task', id)
      if (!S.live(r)) continue
      const p = S.str(r, 'project_id')
      if (p !== '' && !v.projectLive(p)) continue
      if (S.isSet(r, 'completed_at') && !(own(this.st.printed, id) && this.st.printed[id] !== '')) continue
      n++
    }
    return n
  }
}

/** A file the vault reads: `.md` outside hidden folders, not a conflict file. */
export function vaultFile(rel: string): boolean {
  if (!rel.endsWith('.md') || rel.endsWith('.conflict.md')) return false
  return !rel.split('/').some((part) => part.startsWith('.'))
}

/** The file iCloud leaves for a file it has not downloaded: `.<name>.icloud` beside it. */
export function icloudPlaceholder(p: string): string {
  const i = p.lastIndexOf('/')
  return i < 0 ? `.${p}.icloud` : `${p.slice(0, i)}/.${p.slice(i + 1)}.icloud`
}

/** Runs one sync of the vault (internal/vault.Sync). */
export async function sync(o: Options): Promise<Report> {
  const st = o.state ?? (await loadState(o.files))
  if (st.tasknotes !== undefined && st.tasknotes !== null) throw new TaskNotesError('This folder has a TaskNotes folder linked; keep syncing it with `ot vault`.')
  let taken = false
  const owned = checkOwner(st, o.owner, o.now(), o.zone)
  if (owned) {
    if (!o.takeOver) throw owned
    takeOver(st, (o.newDevice ?? randomDevice)())
    taken = true
  }
  const e = new Engine(o, st)
  e.takeOver = taken
  await e.scan()
  await e.pull()
  await e.openAll(e.base)
  await e.openAll(e.app)
  if (!o.readOnly) await merge(e)
  e.ops = [...e.reseed, ...(await e.build())]
  const trial = S.clone(e.app)
  for (const op of e.ops) S.apply(trial, op)
  const n = e.countTasks(trial)
  if (n > MAX_TASKS) throw new LimitError(`the vault would hold ${n} tasks; the limit is ${MAX_TASKS}`)
  if (o.dryRun) {
    if (e.ops.length > 0) e.rep.planned = e.ops
    e.app = trial
    await plan(e, true)
    e.rep.cursor = e.startCursor
    return e.rep
  }
  if (!o.readOnly && e.ops.length > 0) await e.push(e.ops)
  for (const op of e.ops) {
    if (e.refused.has(op.id)) continue
    const ts = e.stamped.get(op.id)
    S.apply(e.app, ts === undefined ? op : { ...op, ts })
  }
  await e.openAll(e.app)
  await plan(e, false)
  e.saveBase()
  st.initialized = true
  if (o.owner) {
    st.owner = { ...o.owner }
    st.lease_until = o.now() + LEASE_MS
  }
  await saveState(o.files, st)
  e.rep.cursor = st.cursor
  return e.rep
}
