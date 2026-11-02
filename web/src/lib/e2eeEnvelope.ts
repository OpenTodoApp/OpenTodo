// The content-value layer of end-to-end encryption (OpenSpec changes `e2ee` and
// `obsidian-plugin` D10): which op fields are content, how a value becomes the
// plaintext it encrypts as and back, and the envelope of one value. Pure: it
// imports the Web Crypto primitives of crypto.ts and the generated field list,
// nothing else (no database, API client, shell or i18n state), so the Obsidian
// plugin (obsidian/) bundles this very file. e2ee.ts re-exports what the app uses;
// e2ee.vectors.json pins it.
import { OP_CONTENT_FIELDS } from '../generated/opSchema'
import { decryptValue, encryptValue, isEnvelope } from './crypto'
import type { Entity } from './types'

/**
 * Fields encrypted for an encrypted account, in its personal scope only (shared
 * projects are never encrypted). Keep in step with internal/e2ee ContentFields.
 * task.labels holds label ids, so label names are encrypted instead of the
 * array (design.md, implementation notes).
 */
export const CONTENT_FIELDS: Partial<Record<Entity, readonly string[]>> = OP_CONTENT_FIELDS

/**
 * Families of content fields named by a prefix: a task's custom field values
 * `fields.<id>` (custom-fields D4). Only string values are encrypted (text, link,
 * date, choice); numbers and checkboxes stay plaintext. Keep in step with
 * internal/e2ee ContentPrefixes.
 */
export const CONTENT_PREFIXES: Partial<Record<Entity, readonly string[]>> = {
  // Pending appends `appends.<id>` (notes-overview D13) are note text.
  task: ['fields.', 'appends.'],
  note: ['appends.'],
}

export function isContentField(entity: Entity, field: string): boolean {
  if (CONTENT_FIELDS[entity]?.includes(field)) return true
  return CONTENT_PREFIXES[entity]?.some((p) => field.startsWith(p) && field.length > p.length) ?? false
}

/** Content values that are objects on the device and one encrypted JSON string on the wire (task-origin D2). */
const OBJECT_CONTENT: Partial<Record<Entity, readonly string[]>> = { task: ['origin', 'location'], place: ['geo'] }

function isObjectContent(entity: Entity, field: string): boolean {
  return OBJECT_CONTENT[entity]?.includes(field) ?? false
}

/**
 * The plaintext a content value encrypts as: a string as it is, an object-valued
 * field (task.origin) as its JSON. null, numbers, booleans and a string in an
 * object-valued field (an envelope or the undecryptable placeholder) give null:
 * nothing to encrypt.
 */
export function contentToString(entity: Entity, field: string, value: unknown): string | null {
  if (isObjectContent(entity, field)) return value !== null && typeof value === 'object' ? JSON.stringify(value) : null
  return typeof value === 'string' ? value : null
}

/** The device value of decrypted plaintext: the object for an object-valued field, else the string. */
export function contentFromString(entity: Entity, field: string, plaintext: string): unknown {
  if (!isObjectContent(entity, field)) return plaintext
  try {
    const v: unknown = JSON.parse(plaintext)
    return v !== null && typeof v === 'object' ? v : plaintext
  } catch {
    return plaintext
  }
}

/**
 * The wire value of one op value for the personal scope of an encrypted account:
 * an envelope for non-empty content, the value itself otherwise (not content,
 * empty, null, already an envelope).
 */
export async function sealValue(key: CryptoKey, entity: Entity, entityId: string, field: string, value: unknown): Promise<unknown> {
  if (!isContentField(entity, field) || isEnvelope(value)) return value
  const text = contentToString(entity, field, value)
  return text ? encryptValue(key, entity, entityId, field, text) : value
}

/** The device value of a wire value: decrypted when it is an envelope (throws DecryptError when it is not authentic). */
export async function openValue(key: CryptoKey, entity: Entity, entityId: string, field: string, value: unknown): Promise<unknown> {
  if (!isEnvelope(value)) return value
  return contentFromString(entity, field, await decryptValue(key, entity, entityId, field, value))
}
