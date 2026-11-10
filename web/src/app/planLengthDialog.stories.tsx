import type { Meta, StoryObj } from '@storybook/react-vite'
import { CustomSpanDialog } from './PlanView'

// Rare overlay (OpenSpec change quarter-view-and-plan-spans): the dialog behind
// Plan's **Custom…** menu item, for any whole number of days from 1 to 90.
const meta: Meta = { title: 'Screens/Plan length dialog' }
export default meta

const noop = () => {}

/** A custom length with the field's range and the Save / Cancel actions. */
export const CustomLength: StoryObj = {
  render: () => <CustomSpanDialog span={14} onSave={noop} onCancel={noop} />,
}
