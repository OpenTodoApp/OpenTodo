// The overlay module in the workbench (OpenSpec change web-layering): it moved
// from src/app into the design system, so its pieces have stories here. They are
// a11y-checked; the open Menu has its screenshot in UI/Menu, and these carry no
// baseline yet (tag no-visual) until `make ui-baselines` records them, except
// Dialog/Sheet, which has its own (lean-chrome D8).
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

/** placement="sheet" (lean-chrome D3): a bottom sheet of at most two thirds of a phone, the page visible above; the centred card from 640 px. */
function SheetDemo() {
  const [open, setOpen] = useState(true)
  return (
    <>
      <p className="text-body">The page behind the sheet stays visible above it.</p>
      <Button onClick={() => setOpen(true)}>Open sheet</Button>
      {open && (
        <Dialog title="Add your first task" placement="sheet" size="md" onClose={() => setOpen(false)}>
          <p className="text-meta text-muted">Step 1 of 3</p>
          <p className="mt-1 text-body text-muted">Type a line here and press Enter; it goes to your Inbox.</p>
          <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="secondary">Skip this step</Button><Button size="sm" variant="ghost">Skip all</Button></div>
        </Dialog>
      )}
    </>
  )
}

/** placement="bottom" (routines-dynamic-data D13): a bottom sheet at every width, sized to its content. */
function BottomDemo() {
  const [open, setOpen] = useState(true)
  return (
    <>
      <p className="text-body">An editor that belongs to a place on the page opens from the bottom.</p>
      <Button onClick={() => setOpen(true)}>Open bottom sheet</Button>
      {open && (
        <Dialog title="Condition" placement="bottom" onClose={() => setOpen(false)}>
          <p className="text-body text-muted">Only for tasks that are due earlier and have the label waiting.</p>
          <div className="mt-3 flex justify-end"><Button size="sm" variant="primary" onClick={() => setOpen(false)}>Done</Button></div>
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
// Recorded at 375 and 1280 px like the patterns, so the sheet has its own baselines.
export const DialogSheet: StoryObj = { name: 'Dialog/Sheet', tags: ['!no-visual'], render: () => <SheetDemo /> }
export const DialogBottom: StoryObj = { name: 'Dialog/Bottom', tags: ['!no-visual'], render: () => <BottomDemo /> }
export const PopoverOpen: StoryObj = { render: () => <PopoverDemo /> }
export const MenuOpen: StoryObj = { render: () => <MenuDemo /> }
export const Toasts: StoryObj = {
  render: () => (
    <ToastRegion label="Notifications">
      <div className="rounded-control bg-raised p-3 text-body shadow">Task completed</div>
    </ToastRegion>
  ),
}
