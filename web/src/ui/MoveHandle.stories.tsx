import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { MoveHandle } from './MoveHandle'

/** A short ordered list whose rows drag by their handle; a click on the handle offers Move up and Move down. */
function Demo() {
  const [items, setItems] = useState(['Ada', 'Grace', 'Linus'])
  const move = (i: number, delta: -1 | 1) => setItems((cur) => {
    const next = [...cur]
    const [it] = next.splice(i, 1)
    next.splice(i + delta, 0, it)
    return next
  })
  return (
    <ol aria-label="Turn order" className="w-72 divide-y divide-default rounded-card border border-default">
      {items.map((name, i) => (
        <li key={name} className="flex min-h-11 items-center gap-2 px-1.5 py-1">
          <MoveHandle label={`Move ${name}`} first={i === 0} last={i === items.length - 1} onMove={(d) => move(i, d)} />
          <span className="text-body text-default">{name}</span>
        </li>
      ))}
    </ol>
  )
}

const meta: Meta = { title: 'UI/Move handle', parameters: { layout: 'padded' } }
export default meta
export const List: StoryObj = { render: () => <Demo /> }
