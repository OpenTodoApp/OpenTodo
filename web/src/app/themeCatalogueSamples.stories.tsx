import type { Meta, StoryObj } from '@storybook/react-vite'
import { CATALOGUE } from '../lib/theme/builtin/index'
import { withClock } from './stories/fixtures'
import { Sample } from './stories/themeSample'

// The sample screen of every built-in palette (OpenSpec change theme-catalogue,
// design D7): checked by the a11y gate in light and dark, without screenshot
// baselines (tag no-visual), so CI keeps baselines for OpenTodo's two themes only.
const meta: Meta = { title: 'Settings/App/Theme catalogue samples', tags: ['no-visual'], decorators: [withClock] }
export default meta

const entry = (id: string) => CATALOGUE.find((c) => c.id === id)!
const palette = (id: string): StoryObj => ({ render: () => <Sample theme={entry(id)} /> })
export const SolarizedLight = palette('solarized-light')
export const SolarizedDark = palette('solarized-dark')
export const GruvboxLight = palette('gruvbox-light')
export const GruvboxDark = palette('gruvbox-dark')
export const CatppuccinLatte = palette('catppuccin-latte')
export const CatppuccinMocha = palette('catppuccin-mocha')
export const RosePineDawn = palette('rose-pine-dawn')
export const RosePine = palette('rose-pine')
export const TokyoNightLight = palette('tokyo-night-light')
export const TokyoNight = palette('tokyo-night')
export const OneLight = palette('one-light')
export const OneDark = palette('one-dark')
export const Nord = palette('nord')
export const Dracula = palette('dracula')
