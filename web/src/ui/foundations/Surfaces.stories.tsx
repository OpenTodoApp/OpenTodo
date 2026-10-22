import type { Meta, StoryObj } from '@storybook/react-vite'
import { HUES } from '../tokens/palette'
import { Section } from './tokens'

// The five surface styles and the block recipe (OpenSpec change surfaces-v2, design
// D1-D10): every class here is composed of tokens in web/src/index.css.

function Styles() {
  return (
    <Section title="Five surface styles">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="surface-card p-4">
          <p className="text-body font-semibold">Card</p>
          <p className="text-meta text-muted">surface-card: raised fill, card radius, first elevation. Tiles, the primary settings card.</p>
        </div>
        <div className="ui-section-flat">
          <p className="text-body font-semibold">Flat section</p>
          <p className="text-meta text-muted">ui-section-flat: no fill, a hairline above. Settings sections, statistics panels.</p>
        </div>
        <div className="ui-column">
          <p className="px-1 text-body font-semibold">Column</p>
          <ul className="ui-cards--lift space-y-1.5">
            <li className="surface-card p-2 text-meta">ui-column: sunken fill holding cards</li>
            <li aria-hidden className="ui-drop-placeholder h-10" />
          </ul>
        </div>
        <div className="space-y-1.5">
          <p className="text-body font-semibold">Block</p>
          <div data-hue="blue" className="ui-block px-2 py-1 text-meta">ui-block: soft hue fill, solid edge</div>
          <div data-hue="blue" className="ui-block ui-block--row px-1 text-meta">ui-block--row: a Month or Plan row</div>
        </div>
        <div className="space-y-1.5">
          <p className="text-body font-semibold">Event</p>
          <div data-hue="blue" className="ui-block ui-block--event flex items-center gap-1 px-2 py-1 text-meta">
            <span aria-hidden className="ui-block-dot" /><span>ui-block--event: neutral, hatched edge, calendar dot</span>
          </div>
        </div>
      </div>
    </Section>
  )
}

function Blocks() {
  return (
    <Section title="Block recipe: twelve hues at rest, dashed, past, late and event">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {HUES.map((h) => (
          <div key={h.name} data-hue={h.name} className="space-y-1">
            <p className="text-hint text-muted">{h.name}</p>
            <div className="ui-block px-2 py-1 text-meta">Write the release notes</div>
            <div className="ui-block ui-block--dashed px-2 py-1 text-meta">No estimate</div>
            <div className="ui-block ui-block--past px-2 py-1 text-meta">Yesterday</div>
            <div className="ui-block ui-block--late px-2 py-1 text-meta">Past its deadline</div>
            <div className="ui-block ui-block--event flex items-center gap-1 px-2 py-1 text-meta"><span aria-hidden className="ui-block-dot" />Team sync</div>
          </div>
        ))}
      </div>
    </Section>
  )
}

const meta: Meta = { title: 'Foundations/Surfaces' }
export default meta
/** Card, flat section, column (with a drop placeholder), block and event. */
export const FiveStyles: StoryObj = { render: () => <Styles /> }
/** Each hue at rest, unestimated, before today, late and as a calendar event. */
export const BlockRecipe: StoryObj = { render: () => <Blocks /> }
