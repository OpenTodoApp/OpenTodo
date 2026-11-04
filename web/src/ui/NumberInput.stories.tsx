import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { NumberInput } from './NumberInput'

function Examples() {
  const [size, setSize] = useState<number | null>(25)
  const [total, setTotal] = useState<number | null>(null)
  const [brk, setBrk] = useState<number | null>(5)
  return (
    <div className="grid max-w-md gap-5">
      <NumberInput label="Maximum file size" unit="MB" min={1} max={500} value={size} onChange={setSize} description="Larger files are refused." />
      <NumberInput label="Storage per account" unit="GB" min={1} max={1000} value={total} onChange={setTotal} noLimit />
      <NumberInput label="Short break" unit="min" min={1} max={60} value={brk} onChange={setBrk} />
      <OutOfRange />
    </div>
  )
}

/** A value outside its range, as typed: the field shows the range as its error. */
function OutOfRange() {
  return <NumberInput key="oor" label="Delete backups older than" unit="days" min={1} max={3650} value={0 as number} onChange={() => {}} />
}

const meta: Meta = { title: 'UI/Number input' }
export default meta
export const Default: StoryObj = { render: () => <Examples /> }
