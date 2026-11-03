// "Switching from…" on the Import screen (OpenSpec change migration-everywhere,
// design D5): choosing the app you use now presets its import format and shows
// its export steps from the switch guide, with a link to the full guide. The
// list opens in place under the field, never as a dialog or sheet.
import { useEffect, useRef, useState, type FocusEvent, type MouseEvent } from 'react'
import { Button, ComboboxField, ComboboxList, Icon, useCombobox, useWide } from '../../ui'
import { SWITCH_APPS, loadExportSteps, type SwitchApp } from '../../lib/switchApps'
import { t } from '../../lib/i18n'
import { navigate } from '../router'

export interface SwitchFromPickerProps {
  /** The chosen app's guide id, or null. */
  value: string | null
  onChange: (app: SwitchApp | null) => void
  disabled: boolean
  /** The account encrypts its content: imported text arrives in plaintext until a device re-encrypts it. */
  encrypted: boolean
  /** Steps of a guide; the lazily loaded Help bundle by default (tests pass their own). */
  loadSteps?: (app: SwitchApp) => Promise<string>
}

export function SwitchFromPicker({ value, onChange, disabled, encrypted, loadSteps = loadExportSteps }: SwitchFromPickerProps) {
  const app = SWITCH_APPS.find((a) => a.guide === value) ?? null
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const state = useCombobox<SwitchApp>({
    source: SWITCH_APPS, getKey: (a) => a.guide, getLabel: (a) => a.name, selected: app ? [app.guide] : [],
    onPick: (a) => { onChange(a); setOpen(false); setEditing(false) },
    onClose: () => { setOpen(false); setEditing(false) },
  })
  useEffect(() => { if (editing) input.current?.focus() }, [editing])

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) { setOpen(false); setEditing(false) }
  }
  const label = t('Switching from…')
  const showField = !app || editing
  return (
    <section className="space-y-2" data-switch-from>
      <div className="text-body">
        <span className="mb-1 block text-muted" id="switch-from-label">{label}</span>
        {showField ? (
          disabled ? (
            <input className="ui-input" disabled aria-labelledby="switch-from-label" placeholder={t('Choose the app you use now')} />
          ) : (
            <div onBlur={onBlur} className="space-y-1">
              <ComboboxField state={state} label={label} placeholder={t('Choose the app you use now')} inputRef={input}
                expanded={open} onFocus={() => setOpen(true)} />
              {open && (
                <div className="max-h-72 overflow-auto rounded-control border border-default bg-surface p-1" data-switch-from-list>
                  <ComboboxList state={state} label={label} renderLeading={(a) => <Icon name={a.icon} className="text-muted" />} />
                </div>
              )}
            </div>
          )
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-control border border-default px-3 py-2" data-switch-from-chosen>
            <Icon name={app.icon} className="text-muted" />
            <span className="min-w-0 flex-1 truncate font-medium">{app.name}</span>
            <Button variant="ghost" size="sm" disabled={disabled} onClick={() => setEditing(true)}>{t('Change')}</Button>
            <Button variant="ghost" size="sm" icon="x" disabled={disabled} onClick={() => onChange(null)} aria-label={t('Clear the app')} />
          </div>
        )}
      </div>
      {app && <ExportSteps app={app} loadSteps={loadSteps} />}
      {app && encrypted && (
        <p className="text-body text-muted" data-switch-from-e2ee>
          {t('Your account is end-to-end encrypted. Imported text is written in plaintext until one of your unlocked devices re-encrypts it, and duplicates cannot be found by encrypted project or label names.')}
        </p>
      )}
    </section>
  )
}

/** The app's "Export from …" steps; collapsed behind "Show steps" on a phone. */
function ExportSteps({ app, loadSteps }: { app: SwitchApp; loadSteps: (app: SwitchApp) => Promise<string> }) {
  const wide = useWide()
  const [shown, setShown] = useState(false)
  const [html, setHtml] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setHtml(null)
    loadSteps(app).then((h) => { if (live) setHtml(h) }, () => { if (live) setHtml('') })
    return () => { live = false }
  }, [app, loadSteps])
  const guide = () => navigate({ view: 'help', page: `switch/${app.guide}` })
  const onLink = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a')
    const doc = a?.getAttribute('data-doc')
    if (a && doc !== null && doc !== undefined) {
      e.preventDefault()
      navigate({ view: 'help', page: doc })
    }
  }
  const visible = wide || shown
  return (
    <div className="space-y-2 rounded-control bg-sunken p-3 dark:bg-raised" data-switch-from-steps>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="font-semibold">{t('Export from {app}', { app: app.name })}</h3>
        {!wide && (
          <button type="button" className="text-body text-accent underline" aria-expanded={shown} onClick={() => setShown((s) => !s)}>
            {shown ? t('Hide steps') : t('Show steps')}
          </button>
        )}
        <a className="ml-auto text-body text-accent underline" href={`/help/${encodeURIComponent(`switch/${app.guide}`)}`}
          onClick={(e) => { e.preventDefault(); guide() }}>{t('Full guide')}</a>
      </div>
      {visible && (html === null
        ? <p className="text-body text-faint">{t('Loading the steps…')}</p>
        // dangerouslySetInnerHTML: build-time guide HTML from docs/ (the docs build's allow-list), as in HelpContent.
        : html && <div className="help-prose" onClick={onLink} dangerouslySetInnerHTML={{ __html: html }} />)}
    </div>
  )
}
