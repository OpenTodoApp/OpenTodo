import type { Meta, StoryObj } from '@storybook/react-vite'
import { Menu } from '../app/overlay/Menu'
import { Icon } from './Icon'
import { MenuGroup, MenuItem, MenuSeparator } from './Menu'

function Demo() {
  return (
    <div className="flex justify-end">
      <Menu label="View actions" trigger={<Icon name="ellipsis" size="md" />} triggerClassName="ui-btn ui-btn--ghost ui-btn--md ui-btn--icon" kind="menu" open width="sm:w-64">
        <MenuGroup>
          <MenuItem label="Rename" icon="pencil" shortcut="R" onSelect={() => {}} />
          <MenuItem label="Move up" icon="arrow-up" disabled description="Already first in the sidebar" onSelect={() => {}} />
          <MenuItem label="Move down" icon="arrow-down" onSelect={() => {}} />
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup label="Sidebar">
          <MenuItem label="Pin to sidebar" checked onSelect={() => {}} />
          <MenuItem label="Set as start view" checked={false} onSelect={() => {}} />
        </MenuGroup>
        <MenuSeparator />
        <MenuItem label="Delete view" icon="trash-2" danger shortcut="Del" onSelect={() => {}} />
      </Menu>
    </div>
  )
}

const meta: Meta = { title: 'UI/Menu', parameters: { layout: 'padded' } }
export default meta
export const Open: StoryObj = { render: () => <div style={{ minHeight: 420 }}><Demo /></div> }
