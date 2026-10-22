// The profile picture's crop (OpenSpec change settings-refresh, design D10):
// react-easy-crop in a round frame, loaded only when the picture dialog opens.
// Arrow keys move the picture and + and - zoom while the frame has focus
// (registry entries settings.picture-pan and settings.picture-zoom).
import { useState, type KeyboardEvent } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { t } from '../../lib/i18n'

export const MIN_ZOOM = 1
export const MAX_ZOOM = 4
const PAN_STEP = 10
const ZOOM_STEP = 0.2

export interface PictureCropperProps {
  /** An object URL of the chosen image. */
  image: string
  /** The crop in the image's own pixels, whenever it changes. */
  onArea: (area: Area) => void
}

/** The new crop position and zoom for a key, or null when the key is not the cropper's. */
export function cropKey(key: string, crop: { x: number; y: number }, zoom: number): { crop: { x: number; y: number }; zoom: number } | null {
  switch (key) {
    case 'ArrowLeft': return { crop: { ...crop, x: crop.x - PAN_STEP }, zoom }
    case 'ArrowRight': return { crop: { ...crop, x: crop.x + PAN_STEP }, zoom }
    case 'ArrowUp': return { crop: { ...crop, y: crop.y - PAN_STEP }, zoom }
    case 'ArrowDown': return { crop: { ...crop, y: crop.y + PAN_STEP }, zoom }
    case '+': case '=': return { crop, zoom: Math.min(MAX_ZOOM, +(zoom + ZOOM_STEP).toFixed(2)) }
    case '-': case '_': return { crop, zoom: Math.max(MIN_ZOOM, +(zoom - ZOOM_STEP).toFixed(2)) }
    default: return null
  }
}

export default function PictureCropper({ image, onArea }: PictureCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = cropKey(e.key, crop, zoom)
    if (!next) return
    e.preventDefault()
    e.stopPropagation()
    setCrop(next.crop)
    setZoom(next.zoom)
  }
  return (
    <div className="space-y-3">
      <div role="application" tabIndex={0} aria-label={t('Picture crop: arrow keys move it, + and - zoom')} onKeyDown={onKeyDown}
        data-picture-cropper data-zoom={zoom} data-crop={`${crop.x},${crop.y}`}
        className="relative h-64 w-full overflow-hidden rounded-card bg-sunken outline-none focus-visible:ring-2 focus-visible:ring-focus">
        <Cropper image={image} crop={crop} zoom={zoom} minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM} aspect={1} cropShape="round" showGrid={false}
          onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, px) => onArea(px)} />
      </div>
      <label className="flex items-center gap-3 text-meta text-muted">
        {t('Zoom')}
        <input type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="min-w-0 flex-1 accent-(--ot-accent)" />
      </label>
    </div>
  )
}
