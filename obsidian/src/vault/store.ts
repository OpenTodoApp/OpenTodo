// The vault's copy of the account (internal/vault/store.go): fields with the
// clock of the op that wrote them, folded under the log's winner rule.
import { byteOrder, goJSON } from './gojson'

/** One operation of the log, as POST /api/v1/sync sends and serves it. */
export interface Op {
  id: string
  entity: string
  entityId: string
  field: string
  value: unknown
  ts: number
  device: string
  seq?: number
}

/** One stored value and the clock of the op that wrote it. */
export interface Field {
  v: unknown
  t: number
  d: string
}

export type Row = Record<string, Field>
export type Store = Record<string, Record<string, Row>>

/** The entities the vault needs: what it prints and what it resolves. */
const KEPT = new Set(['task', 'project', 'section', 'label', 'field', 'time_entry'])
export const KEPT_ENTITIES = [...KEPT]

/** A greater timestamp wins; ties go to the greater device id (internal/sync.Wins). */
function wins(ts: number, device: string, cur: Field): boolean {
  return ts > cur.t || (ts === cur.t && byteOrder(device, cur.d) > 0)
}

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k)

/** Folds one op into the store and reports whether it changed the stored value. */
export function apply(s: Store, op: Op): boolean {
  if (!KEPT.has(op.entity)) return false
  const byID = own(s, op.entity) ? s[op.entity] : (s[op.entity] = {})
  const row = own(byID, op.entityId) ? byID[op.entityId] : (byID[op.entityId] = {})
  if (own(row, op.field) && !wins(op.ts, op.device, row[op.field])) return false
  row[op.field] = { v: op.value === undefined ? null : op.value, t: op.ts, d: op.device }
  return true
}

export function purge(s: Store, entity: string, id: string): void {
  if (own(s, entity)) delete s[entity][id]
}

/** Copies rows and fields; values are never mutated in place. */
export function clone(s: Store): Store {
  const out: Store = {}
  for (const e of Object.keys(s)) {
    const m: Record<string, Row> = {}
    for (const id of Object.keys(s[e])) m[id] = { ...s[e][id] }
    out[e] = m
  }
  return out
}

/** An entity's row, undefined when unknown. */
export function get(s: Store, entity: string, id: string): Row | undefined {
  if (!own(s, entity) || !own(s[entity], id)) return undefined
  return s[entity][id]
}

/** The ids of an entity, sorted. */
export function ids(s: Store, entity: string): string[] {
  return own(s, entity) ? Object.keys(s[entity]).sort(byteOrder) : []
}

const raw = (r: Row | undefined, f: string): unknown => (r && own(r, f) ? r[f].v : undefined)
const nullish = (v: unknown) => v === null || v === undefined

/** A string field, "" when absent, null or not a string. */
export function str(r: Row | undefined, f: string): string {
  const v = raw(r, f)
  return typeof v === 'string' ? v : ''
}

export function num(r: Row | undefined, f: string): number {
  const v = raw(r, f)
  return typeof v === 'number' ? v : 0
}

/** Whether a field holds a non-null value. */
export function isSet(r: Row | undefined, f: string): boolean {
  return !nullish(raw(r, f))
}

export function bool(r: Row | undefined, f: string): boolean {
  return raw(r, f) === true
}

export function strs(r: Row | undefined, f: string): string[] {
  const v = raw(r, f)
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export function rawOf(r: Row | undefined, f: string): unknown {
  return raw(r, f)
}

/** A row that exists and is not deleted. */
export function live(r: Row | undefined): boolean {
  return r !== undefined && !isSet(r, 'deleted_at')
}

export interface Due {
  date: string
  time?: string
  tz?: string
}

/** A due value, null when unset or unreadable. */
export function dueValue(v: unknown): Due | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  if (typeof o.date !== 'string' || o.date === '') return null
  const d: Due = { date: o.date }
  if (typeof o.time === 'string') d.time = o.time
  if (typeof o.tz === 'string') d.tz = o.tz
  return d
}

export function dueOf(r: Row | undefined): Due | null {
  return dueValue(raw(r, 'due'))
}

/** Rows equal field by field, clock included (rowEqual in plan.go). */
export function rowEqual(a: Row | undefined, b: Row | undefined): boolean {
  const ka = a ? Object.keys(a) : []
  const kb = b ? Object.keys(b) : []
  if (ka.length !== kb.length) return false
  for (const k of ka) {
    const f = a![k]
    const g = b && own(b, k) ? b[k] : undefined
    if (!g || f.t !== g.t || f.d !== g.d || goJSON(f.v) !== goJSON(g.v)) return false
  }
  return true
}
