import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { ThemeList, type ThemeCardData } from './ThemeList'
import examples from './ThemeList.examples.json'

const meta: Meta = { title: 'UI/Theme list' }
export default meta

// The OpenTodo themes preview through the stylesheet's own tokens (theme-engine D14).
const opentodo = (side: 'light' | 'dark'): ThemeCardData => ({
  id: `opentodo-${side}`, name: side === 'light' ? 'OpenTodo Light' : 'OpenTodo Dark', author: 'OpenTodo contributors', scheme: side,
  swatches: { canvas: 'var(--ot-canvas)', surface: 'var(--ot-surface)', text: 'var(--ot-text)', accent: 'var(--ot-accent)', hues: ['green', 'blue', 'violet', 'orange'].map((h) => `var(--ot-hue-${h}-solid)`) },
})
// Other themes give their own colours (theme-catalogue ships real ones; these are examples).
const palettes: ThemeCardData[] = examples

function List({ label, themes, initial, note }: { label: string; themes: ThemeCardData[]; initial: string; note?: string }) {
  const [value, setValue] = useState(initial)
  return <ThemeList label={label} themes={themes} value={value} onChange={setValue} note={note} />
}

/** A fixed mode: one list, in this version the OpenTodo theme alone. */
export const OneSide: StoryObj = {
  render: () => <div className="max-w-2xl bg-surface p-4"><List label="Theme" themes={[opentodo('light')]} initial="opentodo-light" /></div>,
}

/** Mode System: a Light and a Dark list, each its own radio group. */
export const BothSides: StoryObj = {
  render: () => (
    <div className="flex max-w-2xl flex-col gap-3 bg-surface p-4">
      <List label="Light" themes={[opentodo('light'), palettes[1]]} initial="opentodo-light" />
      <List label="Dark" themes={[opentodo('dark'), palettes[0]]} initial="example-night" />
    </div>
  ),
}

/** Several themes: a scrolling row below 40 rem, a grid above; a stored choice this version cannot show. */
export const ManyWithNote: StoryObj = {
  render: () => (
    <div className="max-w-2xl bg-surface p-4">
      <List label="Dark" themes={[opentodo('dark'), ...palettes, { ...palettes[0], id: 'example-3', name: 'Example Three' }]} initial="opentodo-dark" note="Made with a newer version of OpenTodo" />
    </div>
  ),
}

/** A server with a default (theme-instance-default D3): Default names it, the server's theme says where it comes from. */
export const FromThisServer: StoryObj = {
  render: () => (
    <div className="max-w-2xl bg-surface p-4">
      <List label="Dark" initial="server-default" themes={[
        { ...palettes[0], id: 'server-default', name: 'Default (Server default: Example Night)', author: '' },
        opentodo('dark'),
        { ...palettes[0], origin: 'From this server · Server default' },
      ]} />
    </div>
  ),
}
