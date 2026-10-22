// Settings → Account → Profile (OpenSpec change settings-refresh, account-profile
// "Profile in Settings"): picture or initials, name and email, each with an edit
// action. Profile data is server account data, not ops: it is read live and kept
// on this device only as the last loaded values for offline display, where the
// edit actions are disabled with a note.
import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, isNetworkError } from '../../lib/api'
import { setOwnAvatar } from '../../lib/avatars'
import { errorMessage } from '../../lib/i18n/errors'
import { t } from '../../lib/i18n'
import { useOnline } from '../../lib/online'
import { cardCopy, noticeCopy, rowCopy } from '../../lib/settingsCopy'
import type { Profile, User } from '../../lib/types'
import { Button, Dialog, Field, Input, Notice, SettingRow, SettingsSection } from '../../ui'
import { PersonAvatar } from '../PersonAvatar'
import { ACCOUNT_CHANGED_EVENT } from '../UsersPanel'
import { PictureDialog } from './PictureDialog'

const CACHE_KEY = 'opentodo.profile'

function readCache(userId: string): Profile | null {
  try {
    const p = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as Profile | null
    return p?.user.id === userId ? p : null
  } catch {
    return null
  }
}

/** Adopts a profile answer: this device's copy, the own picture version, and the app's user. */
function adopt(p: Profile, prev: Profile | null): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(p)) } catch { /* storage unavailable */ }
  setOwnAvatar(p.user.id, p.avatarVersion)
  if (prev && (prev.user.name !== p.user.name || prev.user.email !== p.user.email)) window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
}

/** The profile, read live when online; the last loaded one otherwise. */
export function useProfile(user: User): { profile: Profile; update: (p: Profile) => void; online: boolean } {
  const online = useOnline()
  const [profile, setProfile] = useState<Profile>(() => readCache(user.id) ?? { user, avatarVersion: 0, emailByLink: false })
  const update = useCallback((p: Profile) => {
    setProfile((prev) => { adopt(p, prev); return p })
  }, [])
  useEffect(() => {
    if (!online) return
    let live = true
    api.profile().then((p) => { if (live) update(p) }).catch(() => undefined)
    return () => { live = false }
  }, [online, update])
  return { profile, update, online }
}

function message(err: unknown): string {
  if (isNetworkError(err)) return noticeCopy('profile', 'offline')
  return err instanceof ApiError ? errorMessage(err.code, err.message) : String(err)
}

/** A one-field dialog for the name or the email. */
export function ProfileFieldDialog({ title, label, initial, type, note, onSubmit, onClose }: {
  title: string; label: string; initial: string; type: 'text' | 'email'; note?: string
  onSubmit: (value: string) => Promise<void>; onClose: () => void
}) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    try {
      await onSubmit(value)
      onClose()
    } catch (err) {
      setError(message(err))
    }
  }
  return (
    <Dialog title={title} onClose={onClose} size="sm" testId="profile-field-dialog">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <Field label={label} description={note} error={error}>
          <Input type={type} value={value} autoFocus maxLength={type === 'email' ? 320 : 80} autoComplete={type === 'email' ? 'email' : 'name'}
            onChange={(e) => setValue(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="primary" type="submit" disabled={!value.trim() || value.trim() === initial} data-profile-save>{t('Save')}</Button>
        </div>
      </form>
    </Dialog>
  )
}

type Editing = 'name' | 'email' | 'picture' | null

export function ProfileSection({ user }: { user: User }) {
  const { profile, update, online } = useProfile(user)
  const [editing, setEditing] = useState<Editing>(null)
  const [error, setError] = useState<string | null>(null)
  const me = profile.user
  const managed = profile.emailManagedBy
  const emailVariant = managed ? 'managed' : profile.emailByLink ? 'link' : 'now'
  const cancelPending = async () => {
    try { update(await api.cancelEmailChange()) } catch (err) { setError(message(err)) }
  }
  return (
    <SettingsSection {...cardCopy('profile')} testId="profile-card">
      {!online && <Notice tone="info">{noticeCopy('profile', 'offline')}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
      <SettingRow {...rowCopy('profile', 'picture')} id="profile-picture"
        status={<PersonAvatar id={me.id} name={me.name || me.email} size="lg" />}
        control={<Button variant="secondary" size="sm" disabled={!online} onClick={() => setEditing('picture')} data-profile-edit="picture">
          {profile.avatarVersion > 0 ? t('Change picture') : t('Add a picture')}</Button>} />
      <SettingRow {...rowCopy('profile', 'name')} id="profile-name"
        status={<span className="user-text" data-profile-value="name">{me.name || t('No name')}</span>}
        control={<Button variant="secondary" size="sm" disabled={!online} onClick={() => setEditing('name')} data-profile-edit="name">{t('Change name')}</Button>} />
      <SettingRow {...rowCopy('profile', 'email', { variant: emailVariant, values: { provider: managed ?? '' } })} id="profile-email"
        status={<span className="user-text" data-profile-value="email">{me.email}</span>}
        control={managed ? undefined : <Button variant="secondary" size="sm" disabled={!online} onClick={() => setEditing('email')} data-profile-edit="email">{t('Change email')}</Button>} />
      {profile.pendingEmail && (
        <Notice tone="info" action={<Button variant="ghost" size="sm" disabled={!online} onClick={() => void cancelPending()} data-profile-cancel-email>{t('Cancel change')}</Button>}>
          <span data-profile-pending>{noticeCopy('profile', 'pending', { values: { email: profile.pendingEmail } })}</span>
        </Notice>
      )}
      {editing === 'name' && (
        <ProfileFieldDialog title={t('Change name')} label={t('Name')} initial={me.name} type="text"
          onSubmit={async (v) => update(await api.renameProfile(v))} onClose={() => setEditing(null)} />
      )}
      {editing === 'email' && (
        <ProfileFieldDialog title={t('Change email')} label={t('New email')} initial={me.email} type="email"
          note={profile.emailByLink ? t('We send a link to the new address; the change happens when you open it.') : t('The change applies at once. You may be asked for your password first.')}
          onSubmit={async (v) => update(await api.changeEmail(v))} onClose={() => setEditing(null)} />
      )}
      {editing === 'picture' && (
        <PictureDialog hasPicture={profile.avatarVersion > 0} onSave={api.putAvatar} onRemove={api.deleteAvatar}
          onDone={update} onClose={() => setEditing(null)} />
      )}
    </SettingsSection>
  )
}
