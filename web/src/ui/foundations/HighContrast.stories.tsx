import type { Meta, StoryObj } from '@storybook/react-vite'
import { useLayoutEffect } from 'react'
import { Badge } from '../Card'
import { Button } from '../Button'
import { Notice } from '../patterns/Notice'
import { Section } from './tokens'

// The high-contrast override (OpenSpec change display-mode, design D4): display
// routes set data-contrast="high" on <html> while they are shown. The story does
// the same so the workbench, its a11y gate and the visual baselines cover it.
function HighContrast() {
  useLayoutEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-contrast', 'high')
    return () => root.removeAttribute('data-contrast')
  }, [])
  return (
    <Section title="High contrast (display mode)">
      <p className="text-meta text-muted">
        Black on white or white on black, no soft tints, borders at full strength, text at 7:1 or more. Only display routes turn it on.
      </p>
      <div className="space-y-3 rounded-card border border-default bg-surface p-4">
        <p className="text-body text-strong">Buy bread <span className="text-muted">· today</span></p>
        <p className="text-body text-default">Water the plants <span className="text-faint">· tomorrow</span></p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge hue="red">P1</Badge>
          <Badge hue="green">Done</Badge>
          <Button variant="primary" size="sm">Primary</Button>
          <Button size="sm">Secondary</Button>
        </div>
        <Notice tone="warning">This list is public: anyone with the link can tick items.</Notice>
      </div>
    </Section>
  )
}

const meta: Meta<typeof HighContrast> = { title: 'Foundations/High contrast', component: HighContrast }
export default meta
export const Default: StoryObj<typeof HighContrast> = {}
