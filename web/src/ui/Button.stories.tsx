import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button, IconButton, type ButtonSize, type ButtonVariant } from './Button'

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger']
const SIZES: ButtonSize[] = ['sm', 'md', 'lg']
const never = () => new Promise(() => {})

function Matrix() {
  return (
    <div className="space-y-4">
      {SIZES.map((size) => (
        <div key={size} className="flex flex-wrap items-center gap-3">
          {VARIANTS.map((v) => <Button key={v} variant={v} size={size}>{v[0].toUpperCase() + v.slice(1)}</Button>)}
          <Button variant="primary" size={size} icon="plus">With icon</Button>
          <IconButton icon="ellipsis" label="More actions" size={size} />
        </div>
      ))}
    </div>
  )
}

function States() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary" disabled>Disabled</Button>
      <Button variant="primary" busy>Saving</Button>
      <Button variant="secondary" onClick={never}>Click: stays busy</Button>
      <Button variant="secondary" iconEnd="chevron-down">Menu</Button>
      <IconButton icon="trash-2" label="Delete task" variant="danger" />
      <IconButton icon="x" label="Close" busy />
    </div>
  )
}

const meta: Meta = { title: 'UI/Button' }
export default meta
export const Variants: StoryObj = { render: () => <Matrix /> }
export const StatesStory: StoryObj = { name: 'States', render: () => <States /> }
