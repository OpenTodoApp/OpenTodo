import type { StorybookConfig } from '@storybook/react-vite'
import type { PluginOption } from 'vite'

// OpenSpec design-language: the design workbench. Dev-only; nothing here reaches
// internal/web/dist (guarded by src/ui/workbench.test.ts).
const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-docs'],
  core: { disableTelemetry: true },
  // Reuse vite.config.ts (React, Tailwind) but drop the PWA plugin, so no service
  // worker or manifest gets into the workbench.
  async viteFinal(cfg) {
    const isPwa = (p: PluginOption) =>
      !!p && typeof p === 'object' && 'name' in p && String(p.name).startsWith('vite-plugin-pwa')
    const strip = (list: PluginOption[]): PluginOption[] =>
      list.filter((p) => !isPwa(p)).map((p) => (Array.isArray(p) ? strip(p) : p))
    return { ...cfg, plugins: strip(cfg.plugins ?? []) }
  },
}

export default config
