// Photos for the assistant composer (voice-ramble 4.1): accepted types, upright
// decoding, the 1568 px long edge, JPEG 0.85, the 3.75 MB cap and at most 4.
import { describe, expect, it } from 'vitest'
import { addPhotos, fitSize, JPEG_QUALITY, MAX_EDGE, MAX_PHOTO_BYTES, MAX_PHOTOS, PHOTO_MESSAGES, photoType, preparePhoto, wireImages, type PhotoCodec } from './assistantImages'

/** A codec that records what it was asked and returns a JPEG of the given size. */
function fakeCodec(opts: { width: number; height: number; undecodable?: string[]; outBytes?: number }) {
  const seen: { decoded: string[]; encoded: { width: number; height: number; quality: number }[]; closed: number } = { decoded: [], encoded: [], closed: 0 }
  const codec: PhotoCodec = {
    async decode(file) {
      const type = file.type || 'unknown'
      seen.decoded.push(type)
      if (opts.undecodable?.includes(type)) throw new Error('cannot decode')
      return { width: opts.width, height: opts.height, close: () => { seen.closed++ } }
    },
    async encode(_img, width, height, quality) {
      seen.encoded.push({ width, height, quality })
      return new Blob([new Uint8Array(opts.outBytes ?? 64).fill(0xff)], { type: 'image/jpeg' })
    },
  }
  return { codec, seen }
}

const file = (type: string, name = 'photo') => Object.assign(new Blob([new Uint8Array(16)], { type }), { name })

describe('preparePhoto', () => {
  it('scales a large PNG so its long edge is 1568 px and re-encodes it as JPEG 0.85', async () => {
    const { codec, seen } = fakeCodec({ width: 4032, height: 3024 })
    const p = await preparePhoto(file('image/png'), codec)
    expect(seen.encoded).toEqual([{ width: MAX_EDGE, height: 1176, quality: JPEG_QUALITY }])
    expect(p).toMatchObject({ mediaType: 'image/jpeg', width: 1568, height: 1176 })
    expect(atob(p.data).length).toBe(64)
    expect(seen.closed).toBe(1)
  })

  it('uses the upright size of a rotated JPEG (the decoder applies the orientation)', async () => {
    // A portrait photo stored landscape with EXIF orientation 6 decodes as portrait.
    const { codec, seen } = fakeCodec({ width: 3024, height: 4032 })
    const p = await preparePhoto(file('image/jpeg'), codec)
    expect(seen.encoded[0]).toMatchObject({ width: 1176, height: 1568 })
    expect(p.height).toBeGreaterThan(p.width)
  })

  it('keeps a small photo at its size', async () => {
    const { codec, seen } = fakeCodec({ width: 800, height: 600 })
    await preparePhoto(file('image/webp'), codec)
    expect(seen.encoded[0]).toMatchObject({ width: 800, height: 600 })
  })

  it('refuses HEIC where the browser cannot decode it, and a PDF at once', async () => {
    const { codec, seen } = fakeCodec({ width: 10, height: 10, undecodable: ['image/heic'] })
    await expect(preparePhoto(file('image/heic'), codec)).rejects.toThrow(PHOTO_MESSAGES.undecodable)
    await expect(preparePhoto(file('application/pdf', 'agenda.pdf'), codec)).rejects.toThrow(PHOTO_MESSAGES.type)
    expect(seen.decoded).toEqual(['image/heic']) // the PDF is never decoded
  })

  it('refuses a photo still over 3.75 MB after encoding', async () => {
    const { codec } = fakeCodec({ width: 100, height: 100, outBytes: MAX_PHOTO_BYTES + 1 })
    await expect(preparePhoto(file('image/jpeg'), codec)).rejects.toThrow(PHOTO_MESSAGES.tooLarge)
  })
})

describe('addPhotos', () => {
  it('attaches at most 4 and says so for the fifth', async () => {
    const { codec } = fakeCodec({ width: 10, height: 10 })
    const first = await addPhotos([], [file('image/jpeg'), file('image/jpeg'), file('image/jpeg')], codec)
    expect(first).toMatchObject({ error: null })
    const next = await addPhotos(first.photos, [file('image/jpeg'), file('image/jpeg')], codec)
    expect(next.photos).toHaveLength(MAX_PHOTOS)
    expect(next.error).toBe(PHOTO_MESSAGES.tooMany)
    expect(wireImages(next.photos)[0]).toEqual({ media_type: 'image/jpeg', data: next.photos[0].data })
  })

  it('keeps the accepted files when one is refused', async () => {
    const { codec } = fakeCodec({ width: 10, height: 10 })
    const r = await addPhotos([], [file('application/pdf'), file('image/png')], codec)
    expect(r.photos).toHaveLength(1)
    expect(r.error).toBe(PHOTO_MESSAGES.type)
  })
})

describe('photoType and fitSize', () => {
  it('reads the type, or the extension when the browser gives none', () => {
    expect(photoType({ type: 'image/JPEG' })).toBe('image/jpeg')
    expect(photoType({ type: '', name: 'IMG_0001.HEIC' })).toBe('image/heic')
    expect(photoType({ type: '', name: 'notes.txt' })).toBeNull()
    expect(photoType({ type: 'image/svg+xml' })).toBeNull()
  })
  it('never enlarges', () => {
    expect(fitSize(100, 50)).toEqual({ width: 100, height: 50 })
    expect(fitSize(3136, 100)).toEqual({ width: 1568, height: 50 })
  })
})
