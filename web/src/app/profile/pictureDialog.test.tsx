// @vitest-environment happy-dom
// The profile picture dialog (OpenSpec change settings-refresh, account-profile
// "Profile picture"): the keyboard moves and zooms the crop, the crop is drawn
// into a 256×256 canvas and uploaded as JPEG; the Avatar falls back to initials.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect, useRef } from 'react'
import { act } from 'react'
import { click, flush, key, render } from '../../ui/test-utils'
import { Avatar } from '../../ui'
import type { Profile } from '../../lib/types'

// The real cropper needs layout and a loaded image; this one reports a crop at once
// and shows the position and zoom it is given.
vi.mock('react-easy-crop', () => ({
  default: function MockCropper({ crop, zoom, onCropComplete }: { crop: { x: number; y: number }; zoom: number; onCropComplete: (a: unknown, px: unknown) => void }) {
    const report = useRef(onCropComplete)
    useEffect(() => { report.current({}, { x: 100, y: 50, width: 800, height: 800 }) }, [])
    return <div data-mock-cropper={`${crop.x},${crop.y}@${zoom}`} />
  },
}))
import { PictureDialog } from './PictureDialog'
import { cropKey, MAX_ZOOM } from './PictureCropper'
import { pictureFileProblem } from './picture'

const drawn: unknown[][] = []
beforeEach(() => {
  drawn.length = 0
  URL.createObjectURL = vi.fn(() => 'blob:photo')
  URL.revokeObjectURL = vi.fn()
  // Images "load" at once; the canvas records what is drawn and encodes a JPEG.
  vi.stubGlobal('Image', class { onload: (() => void) | null = null; onerror: (() => void) | null = null; set src(_: string) { setTimeout(() => this.onload?.(), 0) } })
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: (...a: unknown[]) => drawn.push(a) })) as never
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback, type?: string) { cb(new Blob(['jpeg'], { type })) }
})
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })

async function choose(file: File) {
  const input = document.querySelector<HTMLInputElement>('[data-picture-file]')!
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
  for (let i = 0; i < 50 && !document.querySelector('[data-picture-cropper]'); i++) await flush(20)
}
const profile: Profile = { user: { id: 'u1', email: 'a@example.com', name: 'A', role: 'member', createdAt: 1 }, avatarVersion: 1, emailByLink: false }

describe('PictureDialog', () => {
  it('Crop and upload: arrows move, + zooms, Save uploads a 256×256 JPEG of the crop', async () => {
    const onSave = vi.fn(async (_: Blob) => profile)
    const onDone = vi.fn()
    const onClose = vi.fn()
    const r = await render(<PictureDialog hasPicture={false} onSave={onSave} onRemove={vi.fn()} onDone={onDone} onClose={onClose} />)
    expect(document.querySelector('[data-testid="picture-dialog"]')?.textContent).toContain('People who share a project with you see it.')
    await choose(new File(['x'], 'me.webp', { type: 'image/webp' }))
    const frame = document.querySelector<HTMLElement>('[data-picture-cropper]')!
    await key(frame, 'ArrowRight')
    await key(frame, 'ArrowDown')
    await key(frame, '+')
    expect(document.querySelector('[data-mock-cropper]')!.getAttribute('data-mock-cropper')).toBe('10,10@1.2')
    await click(document.querySelector('[data-picture-save]')!)
    for (let i = 0; i < 20 && !onSave.mock.calls.length; i++) await flush(20)
    const blob = onSave.mock.calls[0][0]
    expect(blob.type).toBe('image/jpeg')
    expect(drawn[0].slice(1)).toEqual([100, 50, 800, 800, 0, 0, 256, 256])
    expect(onDone).toHaveBeenCalledWith(profile)
    expect(onClose).toHaveBeenCalled()
    await r.unmount()
  })

  it('refuses a GIF and an image over 10 MB before cropping', async () => {
    const r = await render(<PictureDialog hasPicture onSave={vi.fn()} onRemove={vi.fn()} onDone={vi.fn()} onClose={vi.fn()} />)
    const input = document.querySelector<HTMLInputElement>('[data-picture-file]')!
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'a.gif', { type: 'image/gif' })], configurable: true })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Choose a PNG, JPEG or WebP image.')
    expect(pictureFileProblem({ type: 'image/png', size: 11 * 1024 * 1024 })).toBe('size')
    expect(document.querySelector('[data-picture-remove]')).not.toBeNull()
    await r.unmount()
  })

  it('cropKey clamps the zoom and ignores other keys', () => {
    expect(cropKey('+', { x: 0, y: 0 }, MAX_ZOOM)?.zoom).toBe(MAX_ZOOM)
    expect(cropKey('-', { x: 0, y: 0 }, 1)?.zoom).toBe(1)
    expect(cropKey('ArrowLeft', { x: 0, y: 0 }, 1)?.crop).toEqual({ x: -10, y: 0 })
    expect(cropKey('a', { x: 0, y: 0 }, 1)).toBeNull()
  })
})

describe('Avatar with a picture', () => {
  it('draws the picture over the initials, and the initials alone when it fails to load', async () => {
    const r = await render(<Avatar id="u1" name="Ada Lovelace" src="/api/v1/users/u1/avatar?v=2" />)
    const img = document.querySelector('img')!
    expect(img.getAttribute('src')).toBe('/api/v1/users/u1/avatar?v=2')
    expect(document.querySelector('[data-avatar-picture]')!.textContent).toBe('AL')
    await act(async () => { img.dispatchEvent(new Event('error')) })
    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('[data-hue]')!.textContent).toBe('AL')
    await r.unmount()
  })
})
