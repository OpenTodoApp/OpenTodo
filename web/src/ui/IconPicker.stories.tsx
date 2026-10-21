import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useState, type ReactNode } from 'react'
import { IconPicker } from './IconPicker'
import { loadCatalogue } from './icons/catalogue'

// The searchable icon picker (OpenSpec change icons-and-section-style). Each story
// waits for the catalogue's chunk before it is captured.
function Loaded({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  useEffect(() => { void loadCatalogue().then(() => setReady(true)) }, [])
  return ready ? <div className="w-80 rounded-card border border-default bg-surface p-1">{children}</div> : <span data-story-pending />
}

function Picker(props: { value: string | null; defaultQuery?: string; color?: string }) {
  const [value, setValue] = useState(props.value)
  return <IconPicker value={value} onPick={setValue} color={props.color} defaultQuery={props.defaultQuery} />
}

const meta: Meta = { title: 'UI/Icon picker' }
export default meta

export const EmptySearch: StoryObj = { render: () => <Loaded><Picker value={null} /></Loaded> }
export const KeywordSearch: StoryObj = { render: () => <Loaded><Picker value="paw-print" defaultQuery="dog" color="#f97316" /></Loaded> }
export const UnknownCurrentName: StoryObj = { render: () => <Loaded><Picker value="from-a-newer-release" defaultQuery="hour" /></Loaded> }
/** The catalogue never loaded and the device is offline: interface icons only, with a note. */
function Offline() {
  const [shown, setShown] = useState(false)
  // Captured once the failed load has rendered the note, not while "Loading…" is up.
  useEffect(() => {
    let frame = 0
    const check = () => { if (document.querySelector('[data-icons-offline]')) setShown(true); else frame = requestAnimationFrame(check) }
    frame = requestAnimationFrame(check)
    return () => cancelAnimationFrame(frame)
  }, [])
  return (
    <div className="w-80 rounded-card border border-default bg-surface p-1">
      {!shown && <span data-story-pending />}
      <IconPicker value="briefcase" onPick={() => {}} load={() => Promise.reject(new Error('offline'))} />
    </div>
  )
}
export const OfflineBeforeLoad: StoryObj = { render: () => <Offline /> }
