// Photos for the assistant composer (OpenSpec change voice-ramble, design D3):
// each image is decoded on the device (turned upright from its EXIF
// orientation), scaled so its long edge is at most 1568 px and re-encoded as
// JPEG at quality 0.85, which drops its metadata and location. At most 4 go with
// one message, each at most 3.75 MB after encoding. The pixels live only in
// memory until the message is sent; the conversation keeps "N photos (not
// kept)" instead. Loaded with the assistant chunk.
import { t } from './i18n'
import { readJSON, writeJSON } from './deviceStorage'
import { uuid } from './ids'

export const MAX_PHOTOS = 4
export const MAX_EDGE = 1568
export const JPEG_QUALITY = 0.85
/** 3.75 MB, Anthropic's per-image limit (internal/assistant MaxImageBytes). */
export const MAX_PHOTO_BYTES = 3_932_160

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
const EXTENSIONS: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif' }

/** A photo ready to send: base64 JPEG data and a preview URL for the thumbnail. */
export interface PreparedPhoto {
  id: string
  mediaType: 'image/jpeg'
  data: string
  bytes: number
  width: number
  height: number
  /** An object URL of the prepared JPEG; revoke it with releasePhoto. */
  preview: string
}

export class PhotoError extends Error {}

export const PHOTO_MESSAGES = {
  get type() { return t('Only photos can be added: JPEG, PNG, WebP, GIF or HEIC.') },
  get undecodable() { return t('This browser cannot open this photo. Try a JPEG or PNG.') },
  get tooLarge() { return t('This photo is still larger than 3.75 MB after scaling. Try a smaller one.') },
  get tooMany() { return t('At most 4 photos go with one message.') },
}

/** The media type of a file, from its type or, when the browser gives none (HEIC on some systems), its name. */
export function photoType(file: { type: string; name?: string }): string | null {
  const type = file.type.toLowerCase()
  if (ACCEPTED.includes(type)) return type
  if (!type) {
    const ext = (file.name ?? '').split('.').pop()?.toLowerCase() ?? ''
    return EXTENSIONS[ext] ?? null
  }
  return null
}

/** The scaled size: the long edge at most MAX_EDGE, never enlarged. */
export function fitSize(width: number, height: number, max = MAX_EDGE): { width: number; height: number } {
  const long = Math.max(width, height)
  if (long <= max) return { width, height }
  const k = max / long
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) }
}

interface Decoded { width: number; height: number; close?: () => void }

/** What preparing needs from the browser; replaceable in tests. */
export interface PhotoCodec {
  /** Decode the file upright (EXIF orientation applied) or throw. */
  decode(file: Blob): Promise<Decoded>
  /** Draw the decoded image at the size and encode it as JPEG. */
  encode(img: Decoded, width: number, height: number, quality: number): Promise<Blob>
}

export const browserCodec: PhotoCodec = {
  decode: (file) => createImageBitmap(file, { imageOrientation: 'from-image' }),
  async encode(img, width, height, quality) {
    if (typeof OffscreenCanvas === 'function') {
      const c = new OffscreenCanvas(width, height)
      c.getContext('2d')!.drawImage(img as ImageBitmap, 0, 0, width, height)
      return c.convertToBlob({ type: 'image/jpeg', quality })
    }
    const c = document.createElement('canvas')
    c.width = width
    c.height = height
    c.getContext('2d')!.drawImage(img as ImageBitmap, 0, 0, width, height)
    return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', quality))
  },
}

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Prepare one file for sending, or throw PhotoError with the reason in words. */
export async function preparePhoto(file: File | (Blob & { name?: string }), codec: PhotoCodec = browserCodec): Promise<PreparedPhoto> {
  if (!photoType(file)) throw new PhotoError(PHOTO_MESSAGES.type)
  let img: Decoded
  try {
    img = await codec.decode(file)
  } catch {
    throw new PhotoError(PHOTO_MESSAGES.undecodable)
  }
  try {
    const size = fitSize(img.width, img.height)
    const out = await codec.encode(img, size.width, size.height, JPEG_QUALITY)
    if (out.size > MAX_PHOTO_BYTES) throw new PhotoError(PHOTO_MESSAGES.tooLarge)
    const preview = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(out) : ''
    return { id: uuid(), mediaType: 'image/jpeg', data: await base64(out), bytes: out.size, ...size, preview }
  } catch (err) {
    if (err instanceof PhotoError) throw err
    throw new PhotoError(PHOTO_MESSAGES.undecodable)
  } finally {
    img.close?.()
  }
}

/**
 * Add files to the photos already attached: prepared in order, at most
 * MAX_PHOTOS in all. Returns the new list and the first refusal, if any.
 */
export async function addPhotos(current: PreparedPhoto[], files: (File | Blob)[], codec: PhotoCodec = browserCodec): Promise<{ photos: PreparedPhoto[]; error: string | null }> {
  const photos = [...current]
  let error: string | null = null
  for (const f of files) {
    if (photos.length >= MAX_PHOTOS) { error ??= PHOTO_MESSAGES.tooMany; break }
    try {
      photos.push(await preparePhoto(f, codec))
    } catch (err) {
      error ??= err instanceof PhotoError ? err.message : PHOTO_MESSAGES.undecodable
    }
  }
  return { photos, error }
}

/** Free a photo's preview. */
export function releasePhoto(p: PreparedPhoto): void {
  if (p.preview && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(p.preview)
}

/** Whether a refused or failed turn was about its photos (voice-ramble D5). */
export function isImagesUnsupported(code: string | undefined): boolean {
  return code === 'images_unsupported' || code === 'device_images_unsupported'
}

/** The composer's words when the model does not read photos; the message and the photos stay in the field. */
export function imagesUnsupportedMessage(code: string | undefined): string {
  return code === 'device_images_unsupported'
    ? t('The model on this device does not read photos. Remove them and send the message without them.')
    : t('The chosen model does not read photos. Your message and photos are still in the field: remove the photos to send the text.')
}

/** The wire form of the turn route and the on-device providers. */
export function wireImages(photos: PreparedPhoto[]): { media_type: string; data: string }[] {
  return photos.map((p) => ({ media_type: p.mediaType, data: p.data }))
}

// The first-photo note (design D6), confirmed once per device.
const NOTE_KEY = 'opentodo.assistant.photo-note'

export function photoNoteConfirmed(): boolean {
  return readJSON<boolean>(NOTE_KEY, false, (v) => (v === true ? true : null))
}

export function confirmPhotoNote(): void {
  writeJSON(NOTE_KEY, true) // per-device convenience only
}
