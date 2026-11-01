// The theme editor (OpenSpec change theme-editor, design D3 to D10, D13): a Settings
// sub-page at /settings/appearance/themes/<id>. A header row (Back, name, Undo,
// Redo, Save, a menu with Export, Duplicate, the counterpart and Delete), then from
// 64 rem two columns, the controls (contrast, base colours, shape and type,
// Advanced, details) beside the live preview; below 64 rem the preview is a
// collapsible strip above the controls. Changes stay a draft on the device until
// Save; leaving with unsaved changes asks to save, discard or keep editing.
// Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+S work inside the editor only.
import { Suspense, useEffect, useState } from 'react'
import { useEncryption } from '../../lib/e2ee'
import { t } from '../../lib/i18n'
import { useUserPrefsRow } from '../../lib/localData'
import type { ContrastFailure } from '../../lib/theme/check'
import { counterpartDocument } from '../../lib/theme/counterpart'
import { deleteCustomThemeUndoable, duplicateDocument, newThemeId, useCustomThemeList, canAddTheme, limitMessage } from '../../lib/theme/custom'
import { previousTokenValue, withToken } from '../../lib/theme/draft'
import { downloadTheme } from '../../lib/theme/files'
import { Button, Dialog, Icon, IconButton, Input, Menu, MenuItem, MenuSeparator, Notice, PageBody, PageHeader, Skeleton, useMediaQuery } from '../../ui'
import { reportActionError } from '../actionError'
import { showBulkToast, showUndoToast } from '../bulk/toastStore'
import { setLeaveGuard } from '../router'
import { useShortcutScope } from '../shortcuts'
import { ContrastPanel } from './ContrastPanel'
import { DetailsSection, SeedsSection, ShapeTypeSection } from './EditorSections'
import { backToAppearance, openDraft } from './openEditor'
import { ThemePreview, type PreviewTab } from './ThemePreview'
import { TokenList } from './TokenList'
import { useThemeEditor, type ThemeEditorActions, type ThemeEditorState } from './useThemeEditor'

const WIDE = '(min-width: 64rem)'

export function ThemeEditorPage({ id }: { id: string }) {
  const [state, actions] = useThemeEditor(id)
  if (state.status === 'loading') return <p className="px-4 py-6 text-body text-muted" role="status">{t('Loading the theme…')}</p>
  if (state.status === 'missing' || !state.doc) {
    return (
      <PageBody width="form" className="flex flex-col items-start gap-3" data-theme-editor-missing>
        <PageHeader title={t('Theme not found')} sticky={false} back={{ label: t('Appearance'), href: '/settings/appearance/theme', onClick: backToAppearance }} />
        <p className="text-body text-muted">{t('This theme was deleted, or it has not reached this device yet.')}</p>
        <Button variant="secondary" icon="arrow-left" onClick={backToAppearance}>{t('Back to Appearance')}</Button>
      </PageBody>
    )
  }
  return <ThemeEditor id={id} state={state} actions={actions} />
}

/** Leaving asked: `go` continues a navigation the guard held; without it, Back to Appearance. */
type Leave = { go?: () => void } | null

export function ThemeEditor({ id, state, actions }: { id: string; state: ThemeEditorState; actions: ThemeEditorActions }) {
  const doc = state.doc!
  const wide = useMediaQuery(WIDE)
  const [tab, setTab] = useState<PreviewTab>('list')
  const [showPreview, setShowPreview] = useState(true)
  const [leave, setLeave] = useState<Leave>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { enabled: encrypted } = useEncryption()
  const prefs = useUserPrefsRow()
  const themes = useCustomThemeList()
  const resolved = state.resolution?.resolved ?? null
  const failures = state.resolution?.failures ?? null

  // Leaving with unsaved changes asks first (design D7); the draft is kept either way.
  const dirty = state.dirty
  useEffect(() => {
    if (!dirty) return
    setLeaveGuard((go) => { setLeave({ go }); return true })
    return () => setLeaveGuard(null)
  }, [dirty])
  const go = (to: Leave) => {
    setLeave(null)
    setLeaveGuard(null)
    if (!to) return
    if (to.go) to.go()
    else backToAppearance()
  }
  const back = () => (dirty ? setLeave({}) : backToAppearance())

  const save = async () => {
    try {
      const text = await actions.save()
      showBulkToast(text, null)
      return true
    } catch (e) {
      reportActionError(e)
      return false
    }
  }
  useShortcutScope('view', {
    'themes.undo': () => actions.undo(),
    'themes.redo': () => actions.redo(),
    'themes.save': () => { void save() },
  }, { view: 'theme-editor' })

  const taken = themes.filter((x) => x.id !== id).map((x) => x.doc.name)
  const roomForMore = canAddTheme(themes.length)
  const set = (token: string, value: string | undefined, group?: string) => actions.change(withToken(doc, token, value), group)
  const fix = (f: ContrastFailure) => actions.fix({ fg: f.fg, bg: f.bg })
  const controls = (
    <Suspense fallback={<Skeleton count={6} />}>
    <div className="flex flex-col gap-6" data-theme-controls>
      <ContrastPanel failures={failures} resolved={resolved} onFix={fix} onFixAll={actions.fixAll} />
      <SeedsSection doc={doc} resolved={resolved} onChange={actions.change} />
      <ShapeTypeSection doc={doc} onChange={actions.change} />
      <TokenList doc={doc} resolved={resolved} failures={failures ?? []} worst={state.resolution?.worst ?? {}} onSet={set}
        canUndoToken={(tok) => !!state.history && previousTokenValue(state.history, tok) !== null} onUndoToken={actions.undoToken} />
      <DetailsSection doc={doc} encrypted={encrypted} onChange={actions.change} />
    </div>
    </Suspense>
  )
  const preview = <ThemePreview resolved={resolved} kind={doc.kind} tab={tab} onTab={setTab} pending={state.pending} />
  return (
    <PageBody width="full" className="flex min-h-full flex-col" data-theme-editor={id} data-theme-dirty={dirty || undefined}>
      <PageHeader testId="theme-editor-header" sticky
        back={{ label: t('Appearance'), href: '/settings/appearance/theme', onClick: back }}
        title={<Input aria-label={t('Theme name')} value={doc.name} maxLength={60} className="w-full min-w-0 font-semibold" data-theme-name
          onChange={(e) => actions.change({ ...doc, name: e.target.value }, 'name')} />}
        actions={<>
          <IconButton icon="undo-2" label={t('Undo')} shortcut="Ctrl+Z" disabled={!state.canUndo} onClick={actions.undo} data-theme-undo />
          <IconButton icon="undo-2" className="-scale-x-100" label={t('Redo')} shortcut="Ctrl+Shift+Z" disabled={!state.canRedo} onClick={actions.redo} data-theme-redo />
          <Button variant="primary" onClick={save} disabled={!dirty && state.saved} data-theme-save>{t('Save')}</Button>
        </>}
        menu={
          <Menu label={t('More theme actions')} trigger={<Icon name="ellipsis" />} kind="menu" triggerClassName="ui-btn ui-btn--ghost ui-btn--md px-2">
            <MenuItem icon="download" label={t('Export')} onSelect={() => downloadTheme(doc)} />
            <MenuItem icon="copy" label={t('Duplicate')} disabled={!roomForMore} description={roomForMore ? undefined : limitMessage()}
              onSelect={() => openDraft(duplicateDocument(doc, [...taken, doc.name], newThemeId()))} />
            <MenuItem icon={doc.kind === 'light' ? 'moon' : 'sun'} label={doc.kind === 'light' ? t('Create the dark counterpart') : t('Create the light counterpart')}
              disabled={!roomForMore} description={roomForMore ? undefined : limitMessage()} data-theme-counterpart
              onSelect={() => openDraft(counterpartDocument(doc, newThemeId(), doc.kind === 'light' ? t('{name} Dark', { name: doc.name }) : t('{name} Light', { name: doc.name })))} />
            {state.saved && <MenuSeparator />}
            {state.saved && <MenuItem icon="trash-2" danger label={t('Delete')} onSelect={() => setConfirmDelete(true)} />}
          </Menu>
        } />
      <div className="flex flex-col gap-3 pt-3">
        {encrypted && <Notice>{t('Themes are not encrypted. Don\'t put private information in a theme\'s name or notes.')}</Notice>}
        {state.conflict && (
          <Notice tone="warning" action={
            <span className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => actions.resolveConflict(true)}>{t('Keep my draft')}</Button>
              <Button size="sm" variant="ghost" onClick={() => actions.resolveConflict(false)}>{t('Load the saved version')}</Button>
            </span>}>
            {t('This theme changed on another device.')}
          </Notice>
        )}
        {!state.saved && <p className="text-meta text-muted" data-theme-unsaved>{t('Not saved yet: this theme is a draft on this device until you save it.')}</p>}
      </div>
      {wide ? (
        <div className="grid min-h-0 flex-1 grid-cols-[24rem_minmax(0,1fr)] gap-6 py-4">
          <div className="min-w-0">{controls}</div>
          <div className="sticky top-16 self-start">{preview}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 py-3">
          <div>
            <Button variant="ghost" size="sm" icon={showPreview ? 'chevron-down' : 'chevron-right'} aria-expanded={showPreview} onClick={() => setShowPreview((v) => !v)} data-theme-preview-toggle>
              {t('Preview')}
            </Button>
            {showPreview && <div className="mt-2">{preview}</div>}
          </div>
          {controls}
        </div>
      )}
      {leave && (
        <Dialog title={t('Save changes to this theme?')} onClose={() => setLeave(null)}>
          <div className="flex flex-col gap-4">
            <p className="text-body text-default">{t('Your changes are kept as a draft on this device until you save or discard them.')}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setLeave(null)} data-autofocus>{t('Keep editing')}</Button>
              <Button variant="ghost" onClick={() => { actions.discard(); go(leave) }} data-theme-discard>{t('Discard')}</Button>
              <Button variant="primary" onClick={async () => { if (await save()) go(leave) }} data-theme-leave-save>{t('Save')}</Button>
            </div>
          </div>
        </Dialog>
      )}
      {confirmDelete && (
        <Dialog title={t('Delete {name}?', { name: doc.name })} onClose={() => setConfirmDelete(false)} role="alertdialog">
          <div className="flex flex-col gap-4">
            <p className="text-body text-default">{t('The theme is removed from all your devices. A side that uses it goes back to OpenTodo\'s theme. You can undo this.')}</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmDelete(false)} data-autofocus>{t('Cancel')}</Button>
              <Button variant="danger" onClick={async () => {
                const r = await deleteCustomThemeUndoable(id, prefs)
                setConfirmDelete(false)
                if (r.entry) showUndoToast(r.label, r.entry.id)
                go({})
              }} data-theme-delete>{t('Delete theme')}</Button>
            </div>
          </div>
        </Dialog>
      )}
    </PageBody>
  )
}
