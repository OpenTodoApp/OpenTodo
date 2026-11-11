// The save bar of a settings form (OpenSpec change settings-foundation, design D8;
// settings-navigation "Settings save behaviour"): ui/patterns/SaveBar while the
// draft has unsaved changes, and the router's leave guard, so opening another page
// or closing the tab asks first. Several forms on one page share the guard: the
// last one to become dirty asks, and Discard there discards every dirty form.
import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog, SaveBar, type SaveBarProps } from '../ui'
import { t } from '../lib/i18n'
import { setLeaveGuard } from './router'

type Asker = (go: () => void) => void
interface Entry { ask: Asker; discard: () => void }
const dirty: Entry[] = []

function sync(): void {
  const top = dirty[dirty.length - 1]
  setLeaveGuard(top ? (go) => { top.ask(go); return true } : null)
}

const unload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }

/** While `on`, leaving the page asks whether to discard; the returned dialog asks it. */
export function useSettingsLeaveGuard(on: boolean, discard: () => void) {
  const [leave, setLeave] = useState<(() => void) | null>(null)
  const latest = useRef(discard)
  useEffect(() => { latest.current = discard })
  useEffect(() => {
    if (!on) return
    const entry: Entry = { ask: (go) => setLeave(() => go), discard: () => latest.current() }
    dirty.push(entry)
    sync()
    if (dirty.length === 1) window.addEventListener('beforeunload', unload)
    return () => {
      dirty.splice(dirty.indexOf(entry), 1)
      sync()
      if (dirty.length === 0) window.removeEventListener('beforeunload', unload)
    }
  }, [on])
  return leave && (
    <ConfirmDialog title={t('Discard unsaved changes?')} consequence={t('Your changes on this page are not saved.')} confirmLabel={t('Discard')}
      onConfirm={() => {
        const go = leave
        setLeave(null)
        for (const e of [...dirty]) e.discard()
        setLeaveGuard(null)
        go()
      }}
      onCancel={() => setLeave(null)} />
  )
}

/** A settings form's save bar with the leave guard. */
export function SettingsSaveBar(props: SaveBarProps) {
  const dialog = useSettingsLeaveGuard(props.dirty, props.onDiscard)
  return (
    <>
      <SaveBar {...props} />
      {dialog}
    </>
  )
}
