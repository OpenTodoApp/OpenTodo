import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Field, Input, Select, Textarea } from './Field'
import { Checkbox, Switch } from './Switch'

function Controls() {
  const [on, setOn] = useState(true)
  return (
    <div className="grid max-w-md gap-4">
      <Field label="Project name" description="Visible to everyone you share it with."><Input placeholder="e.g. Kitchen renovation" /></Field>
      <Field label="Email" error="Enter a valid email address."><Input type="email" defaultValue="sam@" /></Field>
      <Field label="Disabled"><Input disabled defaultValue="Read only" /></Field>
      <Field label="Notes"><Textarea placeholder="Anything to remember…" /></Field>
      <Field label="Role"><Select defaultValue="editor"><option value="viewer">Viewer</option><option value="editor">Editor</option></Select></Field>
      <Switch checked={on} onChange={setOn} label="Include task titles" description="Applies immediately on this device." />
      <Switch checked={false} onChange={() => {}} label="Disabled switch" disabled />
      <Checkbox label="Remember this browser" description="Skip the code on this device for 30 days." defaultChecked />
      <Checkbox label="Select all" indeterminate readOnly />
    </div>
  )
}

const meta: Meta = { title: 'UI/Form controls' }
export default meta
export const Default: StoryObj = { render: () => <Controls /> }
