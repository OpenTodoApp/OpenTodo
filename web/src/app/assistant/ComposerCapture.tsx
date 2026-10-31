// The composer's capture controls (OpenSpec change voice-ramble, design D1, D3, D6,
// D10): the microphone for a ramble and "Add photo" (also paste and drop of an
// image) beside the Skills menu, the photo thumbnails with their remove buttons and
// the first-photo note above the field. The microphone shows only with voice
// capture on for this device; "Add photo" only when the model reads photos.
import { type DragEvent, type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import { addPhotos, confirmPhotoNote, MAX_PHOTOS, PHOTO_MESSAGES, photoNoteConfirmed, photoType, releasePhoto, type PreparedPhoto } from '../../lib/assistantImages'
import { t } from '../../lib/i18n'
import { elapsedLabel } from '../../lib/voice/ramble'
import { Button, Icon, Tooltip } from '../../ui'
import { rambleAnnouncement, useRamble } from './useRamble'

export interface CaptureProps {
  draft: string
  onDraft: (s: string) => void
  /** Offer the microphone (the assistant is available here). */
  voice?: boolean
  /** Start listening once the engine is ready (the palette's "Ramble into tasks"); a new value starts again. */
  listenRequest?: number
  photos?: PreparedPhoto[]
  onPhotos?: (p: PreparedPhoto[]) => void
  /** The provider that receives photos, named in the first-photo note; absent hides "Add photo". */
  photoProvider?: string | null
  disabled: boolean
  fieldRef: RefObject<HTMLTextAreaElement | null>
}

export interface Capture {
  tools: ReactNode
  above: ReactNode
  /** An image pasted into the field is attached; returns whether it took the paste. */
  onPasteFiles: (files: File[]) => boolean
  drop: { onDragOver: (e: DragEvent) => void; onDrop: (e: DragEvent) => void }
  listening: boolean
  stop: () => void
}

export function useComposerCapture(p: CaptureProps): Capture {
  const draftRef = useRef(p.draft)
  draftRef.current = p.draft
  const ramble = useRamble({ getText: () => draftRef.current, setText: p.onDraft, fieldRef: p.fieldRef, offered: !!p.voice && !p.disabled })
  const photosOn = !!p.photoProvider && !!p.onPhotos
  const photos = p.photos ?? []
  const [pending, setPending] = useState<File[] | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const latestPhotos = useRef(photos)
  latestPhotos.current = photos

  const startListening = ramble.start
  const handled = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!p.listenRequest || handled.current === p.listenRequest || !ramble.enabled) return
    handled.current = p.listenRequest
    startListening()
  }, [p.listenRequest, ramble.enabled, startListening])

  const attach = async (files: File[]) => {
    setPhotoError(null)
    if (!files.length || !p.onPhotos) return
    if (!files.some((f) => photoType(f))) { setPhotoError(PHOTO_MESSAGES.type); return }
    // The first photo on a device waits for the note to be confirmed (design D6).
    if (!photoNoteConfirmed()) { setPending(files); return }
    setBusy(true)
    try {
      const r = await addPhotos(latestPhotos.current, files)
      p.onPhotos(r.photos)
      setPhotoError(r.error)
    } finally {
      setBusy(false)
    }
  }
  const remove = (id: string) => {
    const gone = photos.find((x) => x.id === id)
    if (gone) releasePhoto(gone)
    p.onPhotos?.(photos.filter((x) => x.id !== id))
    setPhotoError(null)
  }

  const tools = (
    <>
      {ramble.enabled && <MicButton listening={ramble.listening} onToggle={ramble.toggle} />}
      {photosOn && (
        <>
          <Tooltip label={t('Add photo')}>
            <button type="button" data-assistant-photo aria-label={t('Add photo')} className="ui-btn ui-btn--ghost ui-btn--sm touch-target px-2"
              disabled={p.disabled || busy || photos.length >= MAX_PHOTOS} onClick={() => picker.current?.click()}>
              <Icon name="image" size="sm" />
            </button>
          </Tooltip>
          {/* The system picker offers the camera on phones; capture is not forced. */}
          <input ref={picker} type="file" accept="image/*" multiple hidden data-assistant-photo-input
            onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; void attach(files) }} />
        </>
      )}
    </>
  )

  const above = (
    <CaptureStrip listening={ramble.listening} elapsedMs={ramble.view.elapsedMs} onStop={ramble.stop} message={ramble.view.message} onDismissMessage={ramble.dismissMessage}
      note={pending ? { provider: p.photoProvider ?? '', onContinue: () => { confirmPhotoNote(); const files = pending; setPending(null); void attach(files) }, onCancel: () => setPending(null) } : null}
      photos={photos} onRemove={remove} error={photoError} />
  )

  const imageFiles = (list: FileList | null | undefined) => [...(list ?? [])].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name))
  return {
    tools,
    above: (
      <>
        {above}
        {ramble.enabled && <span className="sr-only" role="status" aria-live="polite" data-assistant-mic-status>{rambleAnnouncement(ramble.view)}</span>}
      </>
    ),
    onPasteFiles: (files) => {
      if (!photosOn) return false
      const imgs = files.filter((f) => f.type.startsWith('image/'))
      if (!imgs.length) return false
      void attach(imgs)
      return true
    },
    drop: {
      onDragOver: (e) => { if (photosOn && e.dataTransfer.types.includes('Files')) e.preventDefault() },
      onDrop: (e) => {
        if (!photosOn || !e.dataTransfer.files.length) return
        e.preventDefault()
        const all = [...e.dataTransfer.files]
        const imgs = imageFiles(e.dataTransfer.files)
        // A dropped PDF or document is refused with the accepted list (via addPhotos).
        void attach(imgs.length === all.length ? imgs : all)
      },
    },
    listening: ramble.listening,
    stop: ramble.stop,
  }
}

export interface CaptureStripProps {
  listening: boolean
  elapsedMs: number
  onStop: () => void
  /** After the limit or a failed piece. */
  message: string | null
  onDismissMessage: () => void
  /** The first-photo note, while it waits for Continue. */
  note: { provider: string; onContinue: () => void; onCancel: () => void } | null
  photos: PreparedPhoto[]
  onRemove: (id: string) => void
  error: string | null
}

/** What sits above the field while capturing: the listening bar, its message, the first-photo note, the thumbnails and a refusal. */
export function CaptureStrip(p: CaptureStripProps) {
  if (!p.photos.length && !p.note && !p.error && !p.listening && !p.message) return null
  return (
    <div className="space-y-1 px-2 pt-2" data-assistant-capture>
      {p.listening && (
        <div className="flex items-center gap-2 rounded-control bg-danger-soft px-2 py-1 text-meta text-danger" data-assistant-listening>
          <span className="min-w-0 flex-1 font-medium">{t('Listening {time}', { time: elapsedLabel(p.elapsedMs) })}</span>
          <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm touch-target px-2" onClick={p.onStop}>{t('Stop')}</button>
        </div>
      )}
      {p.message && (
        <p className="flex items-start gap-2 rounded-control bg-warning-soft px-2 py-1 text-meta text-on-warning-soft" data-assistant-mic-message>
          <span className="min-w-0 flex-1">{p.message}</span>
          <button type="button" className="touch-target underline" onClick={p.onDismissMessage}>{t('Dismiss')}</button>
        </p>
      )}
      {p.note && (
        <div className="space-y-2 rounded-control border border-default bg-sunken px-2 py-2 text-meta" role="group" aria-label={t('Photos')} data-assistant-photo-note>
          <p>{t('Photos you add go to {provider} with this message and are not kept by OpenTodo.', { provider: p.note.provider })}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={p.note.onContinue}>{t('Continue')}</Button>
            <Button size="sm" variant="ghost" onClick={p.note.onCancel}>{t('Cancel')}</Button>
          </div>
        </div>
      )}
      {p.photos.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t('Photos')} data-assistant-photos>
          {p.photos.map((ph, i) => (
            <li key={ph.id} className="relative size-14 overflow-hidden rounded-control border border-default bg-sunken">
              {ph.preview ? <img src={ph.preview} alt={t('Photo {n}', { n: i + 1 })} className="size-full object-cover" /> : <span className="sr-only">{t('Photo {n}', { n: i + 1 })}</span>}
              <button type="button" className="touch-target absolute right-0 top-0 inline-flex size-6 items-center justify-center rounded-bl-control bg-surface text-muted hover:text-strong"
                aria-label={t('Remove photo {n}', { n: i + 1 })} onClick={() => p.onRemove(ph.id)}><Icon name="x" size="xs" /></button>
            </li>
          ))}
        </ul>
      )}
      {p.error && <p role="alert" className="text-meta text-danger" data-assistant-photo-error>{p.error}</p>}
    </div>
  )
}

/** The tray's microphone: "Speak your list", pressed while listening. */
export function MicButton({ listening, onToggle }: { listening: boolean; onToggle: () => void }) {
  return (
    <Tooltip label={listening ? t('Stop listening') : t('Speak your list')} shortcut={listening ? 'Esc' : undefined}>
      <button type="button" data-assistant-mic aria-pressed={listening} aria-label={listening ? t('Stop listening') : t('Speak your list')}
        className={`ui-btn ui-btn--sm touch-target relative px-2 ${listening ? 'ui-btn--secondary bg-danger-soft text-danger' : 'ui-btn--ghost'}`}
        onClick={onToggle}>
        {listening && <span className="absolute inset-1 animate-ping rounded-full bg-danger-soft motion-reduce:hidden" aria-hidden="true" />}
        <Icon name="mic" size="sm" className="relative" />
      </button>
    </Tooltip>
  )
}
