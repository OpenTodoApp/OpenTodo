import type { Meta, StoryObj } from '@storybook/react-vite'
import { BrandMark, BrandWordmark, type BrandSize } from './Brand'

// The brand mark (OpenSpec change sidebar-v2, design D2; design-system "Brand mark").
// The 16 px row is the legibility gate: the loop and the tick must stay apart beside
// a row's checkbox in both themes. The mono mark takes the text tone and the accent
// of its theme, so it is shown in emerald (the default) and violet.
const meta: Meta = { title: 'Foundations/Brand' }
export default meta

const SIZES: BrandSize[] = [16, 20, 24, 32]

/** A task row's round checkbox at its real size, for scale (drawn here, not imported from the row). */
const Checkbox = () => <span aria-hidden="true" className="inline-block h-5 w-5 shrink-0 rounded-full border-2 border-input" />

function Marks({ accent }: { accent: string }) {
  return (
    <div data-accent={accent} className="space-y-3 rounded-card border border-default bg-surface p-4">
      <p className="text-meta text-muted">{accent}</p>
      <ul className="flex flex-wrap items-end gap-6">
        {SIZES.map((size) => (
          <li key={size} className="flex items-center gap-2 text-default" data-brand-size={size}>
            <Checkbox />
            <BrandMark size={size} />
            <span className="text-meta text-muted tabular-nums">{size}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 text-faint"><BrandMark size={24} /><span className="text-meta">quiet tone</span></div>
    </div>
  )
}

export const Default: StoryObj = {
  render: () => (
    <div className="space-y-6 p-4">
      <section className="space-y-3">
        <h2 className="text-h2 font-semibold">Mono, in the interface</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Marks accent="emerald" />
          <Marks accent="violet" />
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-h2 font-semibold">Colour, on other people's surfaces</h2>
        <div className="flex flex-wrap items-end gap-4">
          {SIZES.map((size) => <BrandMark key={size} size={size} variant="colour" />)}
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-h2 font-semibold">With the wordmark</h2>
        <div className="flex items-center gap-2"><BrandMark size={24} /><BrandWordmark /></div>
        <div className="flex items-center gap-3"><BrandMark size={32} /><BrandWordmark className="text-h3" /></div>
      </section>
    </div>
  ),
}
