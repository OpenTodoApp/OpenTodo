// Settings → Server → Branding (OpenSpec change instance-branding): the owner
// names the instance and uploads a logo. Both are server state read live;
// offline the card shows the last values read-only. The logo is sent as the
// file the owner picked (PNG or JPEG, at most 2 MB); the server renders the
// favicon, touch icon, app icons and sidebar sizes from it. Below them, the
// server's default theme and themes (theme-instance-default D4), loaded lazily.
// settings-foundation D8: the name is a field, saved with the save bar; the logo
// and the themes apply when chosen, and a refused logo says why under its row.
import { lazy, Suspense, useEffect, useState, type ChangeEvent, type ReactNode } from 'react'
import { api, isNetworkError } from '../lib/api'
import { type Branding, logoUrl, setBranding, useBranding } from '../lib/branding'
import { t } from '../lib/i18n'
import { useOnline } from '../lib/online'
import { cardCopy, noticeCopy, rowCopy } from '../lib/settingsCopy'
import { Button, Input, Notice, SettingRow, SettingsSection, Skeleton, useDraft } from '../ui'
import { BrandMark } from '../ui'
import { messageOf } from '../lib/errorText'
import { useAction } from '../lib/useAction'
import { SettingsSaveBar } from './SettingsSaveBar'

const BrandingThemes = lazy(() => import('./BrandingThemes'))

export const LOGO_TYPES = ['image/png', 'image/jpeg']
export const LOGO_MAX_BYTES = 2 << 20
export const NAME_MAX = 40

/** The problem with a chosen logo file, or null. */
export function checkLogoFile(file: { type: string; size: number }): string | null {
  if (!LOGO_TYPES.includes(file.type)) return t('Choose a PNG or JPEG image.')
  if (file.size > LOGO_MAX_BYTES) return t('The logo must be at most 2 MB.')
  return null
}

export interface BrandingViewProps {
  value: Branding | null
  online: boolean
  /** A logo change is in flight. */
  busy: boolean
  /** Why the last logo change failed, shown under the logo row. */
  error: string | null
  /** A name save is in flight. */
  savingName?: boolean
  /** Why the last name save failed, shown in the save bar. */
  nameError?: string | null
  onSaveName: (name: string) => void
  onLogo: (file: File) => void
  onRemoveLogo: () => void
  /** The server's default theme and themes (theme-instance-default D4), after the logo. */
  themes?: ReactNode
}

export function BrandingView({ value, online, busy, error, savingName, nameError, onSaveName, onLogo, onRemoveLogo, themes }: BrandingViewProps) {
  const name = useDraft({ name: value?.name ?? '' })
  const [fileError, setFileError] = useState<string | null>(null)
  const disabled = !online || busy || !value
  const typed = name.draft.name.trim()
  const tooLong = [...typed].length > NAME_MAX
  const changed = !!value && typed !== value.name
  const logo = value ? logoUrl(192, value) : undefined
  const choose = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const problem = checkLogoFile(file)
    setFileError(problem)
    if (!problem) onLogo(file)
  }
  const logoProblem = fileError ?? error
  const nameRow = rowCopy('branding', 'name')
  const nameProblem = <span className="text-danger" role="alert">{t('The name is at most {max} characters.', { max: NAME_MAX })}</span>
  const logoRow = rowCopy('branding', 'logo')
  return (
    <SettingsSection {...cardCopy('branding')} testId="branding-panel">
      {!online && <div className="pb-3"><Notice>{noticeCopy('branding', 'offline')}</Notice></div>}
      <SettingRow label={nameRow.label} htmlFor="branding-name"
        description={tooLong ? nameProblem : nameRow.description}
        control={<Input id="branding-name" className="w-56 max-w-full" value={name.draft.name} placeholder="OpenTodo" maxLength={NAME_MAX + 10} disabled={!online || !value}
          aria-invalid={tooLong || undefined} onChange={(e) => name.set({ name: e.target.value })} autoComplete="off" />} />
      <SettingRow label={logoRow.label}
        description={logoProblem ? <span className="text-danger" role="alert" data-branding-error>{logoProblem}</span> : logoRow.description}
        status={<span className="inline-flex items-center gap-2" data-branding-preview>
          {logo ? <img src={logo} width={32} height={32} alt={t('Current logo')} className="rounded-control" /> : <BrandMark size={32} variant="colour" />}
        </span>}
        control={<>
          <label className={`ui-btn ui-btn--secondary ui-btn--sm focus-within:ring-2 focus-within:ring-focus ${disabled ? 'pointer-events-none text-faint' : 'cursor-pointer'}`} aria-disabled={disabled || undefined}>
            {logo ? t('Change logo') : t('Choose logo')}
            <input type="file" accept={LOGO_TYPES.join(',')} className="sr-only" disabled={disabled} onChange={choose} data-branding-file data-touch-exempt />
          </label>
          {logo && <Button variant="danger" size="sm" disabled={disabled} busy={busy} onClick={onRemoveLogo} data-branding-remove>{t('Remove logo')}</Button>}
        </>} />
      <SettingsSaveBar dirty={changed} invalid={tooLong} busy={savingName} error={nameError}
        disabledReason={online ? undefined : noticeCopy('branding', 'offline')}
        onDiscard={name.reset} onSave={() => onSaveName(typed)} />
      {themes}
    </SettingsSection>
  )
}

/** Container: loads and saves the owner's branding and keeps the app's own copy current. */
export function BrandingPanel() {
  const online = useOnline()
  const live = useBranding()
  const [value, setValue] = useState<Branding | null>(null)
  const logo = useAction({ describe: messageOf })
  const name = useAction({ describe: messageOf })
  const { setError } = logo
  useEffect(() => {
    if (!online) return
    void api.brandingSettings().then(setValue, (err) => { if (!isNetworkError(err)) setError(messageOf(err)) })
  }, [online, setError])
  const apply = (next: Branding) => {
    setValue(next)
    setBranding(next)
  }
  return (
    <BrandingView value={value ?? (online ? null : live)} online={online} busy={logo.busy} error={logo.error} savingName={name.busy} nameError={name.error}
      onSaveName={(n) => void name.run(async () => apply(await api.putBrandingName(n)))}
      onLogo={(file) => void logo.run(async () => apply(await api.putBrandingLogo(file)))}
      onRemoveLogo={() => void logo.run(async () => apply(await api.deleteBrandingLogo()))}
      themes={<Suspense fallback={<Skeleton count={2} />}><BrandingThemes online={online} /></Suspense>} />
  )
}
