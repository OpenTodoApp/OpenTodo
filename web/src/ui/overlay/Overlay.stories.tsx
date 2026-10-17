// The overlay module in the workbench (OpenSpec change web-layering): it moved
// from src/app into the design system, so its pieces have stories here. They are
// a11y-checked; the open Menu has its screenshot in UI/Menu, and these carry no
// baseline yet (tag no-visual) until `make ui-baselines` records them.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useRef, useState } from 'react'
import { Button } from '../Button'
import { Icon } from '../Icon'
import { MenuItem } from '../Menu'
import { Dialog } from './Dialog'
import { Menu } from './Menu'
import { Popover } from './Popover'
import { ToastRegion } from './Toasts'

function DialogDemo() {
  const [open, setOpen] = useState(true)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open dialog</Button>
      {open && (
        <Dialog title="Rename project" onClose={() => setOpen(false)}>
          <p className="text-body text-muted">A centred card from 640 px up, a full-screen sheet below.</p>
        </Dialog>
      )}
    </>
  )
}

function PopoverDemo() {
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(true)
  return (
    <div style={{ minHeight: 240 }}>
      <Button ref={anchor} onClick={() => setOpen(true)}>Open popover</Button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} label="Details" className="p-3">
        <p className="text-body">Placed next to its trigger, a bottom sheet on phones.</p>
      </Popover>
    </div>
  )
}

function MenuDemo() {
  return (
    <div className="flex justify-end" style={{ minHeight: 200 }}>
      <Menu label="Task actions" trigger={<Icon name="ellipsis" size="md" />} triggerClassName="ui-btn ui-btn--ghost ui-btn--md ui-btn--icon" kind="menu" open>
        <MenuItem label="Rename" icon="pencil" onSelect={() => {}} />
        <MenuItem label="Delete" icon="trash-2" danger onSelect={() => {}} />
      </Menu>
    </div>
  )
}

const meta: Meta = { title: 'UI/Overlay', parameters: { layout: 'padded' }, tags: ['no-visual'] }
export default meta
export const DialogOpen: StoryObj = { render: () => <DialogDemo /> }
export const PopoverOpen: StoryObj = { render: () => <PopoverDemo /> }
export const MenuOpen: StoryObj = { render: () => <MenuDemo /> }
export const Toasts: StoryObj = {
  render: () => (
    <ToastRegion label="Notifications">
      <div className="rounded-control bg-raised p-3 text-body shadow">Task completed</div>
    </ToastRegion>
  ),
}
