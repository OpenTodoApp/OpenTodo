// The profile picture dialog (OpenSpec change settings-refresh, design D10;
// account-profile "Profile picture"): choose an image, crop it in a circle,
// save it as a 256×256 JPEG, or remove the current one. The cropper is a lazy
// chunk, so react-easy-crop loads only when this dialog opens.
import { lazy, Suspense, useEffect, useState, type ChangeEvent } from 'react'
import { ApiError } from '../../lib/api'
import { errorMessage } from '../../lib/i18n/errors'
import { t } from '../../lib/i18n'
import type { Profile } from '../../lib/types'
import { Button, Dialog, Notice, Skeleton } from '../../ui'
import { cropToJpeg, pictureFileProblem, PICTURE_TYPES, type CropArea } from './picture'

const PictureCropper = lazy(() => import('./PictureCropper'))

export interface PictureDialogProps {
  hasPicture: boolean
  onSave: (picture: Blob) => Promise<Profile>
  onRemove: () => Promise<Profile>
  onDone: (p: Profile) => void
  onClose: () => void
}

/** The message for a failed upload or remove. */
function failure(err: unknown): string {
  return err instanceof ApiError ? errorMessage(err.code, err.message) : t('The picture could not be saved. Try again.')
}

export function PictureDialog({ hasPicture, onSave, onRemove, onDone, onClose }: PictureDialogProps) {
  const [image, setImage] = useState<string | null>(null)
  const [area, setArea] = useState<CropArea | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => () => { if (image) URL.revokeObjectURL(image) }, [image])

  const choose = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const problem = pictureFileProblem(file)
    if (problem) {
      setError(problem === 'type' ? t('Choose a PNG, JPEG or WebP image.') : t('Choose an image of at most 10 MB.'))
      return
    }
    setError(null)
    setArea(null)
    setImage(URL.createObjectURL(file))
  }
  const run = async (fn: () => Promise<Profile>) => {
    setBusy(true)
    setError(null)
    try {
      onDone(await fn())
      onClose()
    } catch (err) {
      setError(failure(err))
    } finally {
      setBusy(false)
    }
  }
  const save = () => { if (image && area) void run(async () => onSave(await cropToJpeg(image, area))) }

  return (
    <Dialog title={t('Profile picture')} onClose={onClose} size="md" testId="picture-dialog">
      <div className="space-y-4">
        <p className="text-meta text-muted">{t('People who share a project with you see it. It is not end-to-end encrypted.')}</p>
        {image ? (
          <Suspense fallback={<Skeleton shape="card" label={t('Loading')} />}>
            <PictureCropper image={image} onArea={setArea} />
          </Suspense>
        ) : null}
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex flex-wrap items-center gap-2">
          <label className="ui-btn ui-btn--secondary ui-btn--md cursor-pointer focus-within:ring-2 focus-within:ring-focus">
            {image ? t('Choose another image') : t('Choose an image')}
            <input type="file" accept={PICTURE_TYPES.join(',')} className="sr-only" onChange={choose} data-picture-file />
          </label>
          {hasPicture && !image && <Button variant="danger" busy={busy} onClick={() => void run(onRemove)} data-picture-remove>{t('Remove picture')}</Button>}
          <span className="flex-1" />
          {image && <Button variant="primary" busy={busy} disabled={!area} onClick={save} data-picture-save>{t('Save picture')}</Button>}
        </div>
      </div>
    </Dialog>
  )
}
