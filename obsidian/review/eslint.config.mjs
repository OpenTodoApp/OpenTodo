// The lint of Obsidian's community directory review (its official rules,
// eslint-plugin-obsidianmd, recommended set with the English locale checks),
// run by review.mjs from the root of a filled release repository, so that it
// sees what the directory's scanner sees. The ignored paths are the scanner's
// own list (the directory's FAQ, "Why are my test or development files being
// included in the scan?") plus the built main.js.
import obsidianmd from 'eslint-plugin-obsidianmd'

export default [
  ...obsidianmd.configs.recommendedWithLocalesEn,
  {
    ignores: [
      'main.js',
      '**/node_modules/**', '**/dist/**', '**/build/**', '**/pkg/**', '**/test-vault/**', '**/.pnpm-store/**', '**/.obsidian/**',
      '**/esbuild.config.mjs', '**/version-bump.mjs', '**/automation/**',
      '**/*.test.*', '**/*.tests.*', '**/*.spec.*', '**/*.specs.*', '**/test/**', '**/tests/**', '**/__tests__/**', '**/testUtils/**', '**/e2e-tests/**',
      '**/mocks/**', '**/__mocks__/**',
      '**/*.cjs', '**/*.mjs', '**/*.cts', '**/*.mts',
      '**/vite/**', '**/scripts/**', '**/docs/**',
      '**/i18n/**', '**/i18next/**', '**/locale/**', '**/locales/**', '**/translations/**', '**/l10n/**',
    ],
  },
  { languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: process.cwd() } } },
]
