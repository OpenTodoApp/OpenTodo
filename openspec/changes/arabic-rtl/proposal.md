# Arabic, with a right-to-left layout

## Why

GitHub issue #885: Arabic is not a catalog added to the current layout. The interface is laid out left to right (physical margins, the sidebar on the left, disclosure chevrons pointing right, swipes that start at the left edge, the docked panel on the right), and `localization` says the document's `dir` is never changed. Shipping Arabic means changing that rule and the layout before the language can be offered. The maintainer decided that the Arabic catalog is drafted by us and then reviewed by a native speaker, as Russian was, and that Arabic includes the right-to-left layout.

## What Changes

- The document's `dir` follows the interface language: `rtl` with `lang="ar"` for Arabic, `ltr` for every other language, from the first screen and on every change, offline included (the task page and the note page too).
- One layout serves both directions: the web app's layout classes name the start and end of the line (`ms-`, `ps-`, `inset-s-`, `text-start`, `border-s`, `rounded-s-`) instead of left and right, and the design-system check (`make ui-lint`) refuses the physical ones. The safe-area insets, the select chevron, the docked panel's slide, the drawer, popover alignment and the rail tooltip follow the direction.
- Icons that point along the line mirror (back, forward and disclosure chevrons and arrows, undo and redo, send, lists, the panel icons); the others (check, clock, logo) do not.
- Input follows the direction: ← and → mean "towards the start" and "towards the end" of the line in lists, menus, tabs, segmented controls, the calendar and the resizers; the row swipe, the edge swipe (from the right edge), the depth of a dragged row and the resizers mirror. A shortcut still never fires while an input method is composing.
- Text people wrote keeps its own direction (an English title in an Arabic row and the other way round); code, keys and the English Help read left to right.
- Arabic numbers stay in Western digits (0-9), dates follow the Arabic language through the existing date preferences, and plurals use Arabic's categories through `Intl.PluralRules` (`one`, `two`, `few` and `other` everywhere, `many` and `zero` where the words differ).
- Time axes drawn from coordinates (the Timeline view, the review charts, the assistant's timeline and free-time strip, the notes and connections graphs) stay left to right in an isolated box for now.
- The design workbench gets a direction parameter and a "Screens/Right to left" group of the core screens.
- Arabic (`ar`, shown as العربية) ships as a community language: a complete web catalog drafted by machine translation, listed in the translation guide as a draft looking for a native reviewer; text outside the web app stays English, as for every community language.

No new mandatory environment variable, no op-log change, no new route, no new dependency.

## Delivery

Two pull requests: the first carries this change and the right-to-left infrastructure and layout (tasks 1 to 5; Arabic is not offered yet, and every other language looks as before); the second adds the catalog and lists Arabic (tasks 6 and 7).

## Out of scope

- Hebrew, Persian and Urdu: the direction work is reusable (`lib/direction.ts` already knows them), but each is its own catalog and review.
- Arabic outside the web app (server emails, the digest, notification channels, the service worker's notification texts, the browser extension, the Android and iOS shells) and Arabic quick-add vocabulary: a community language may miss them (`localization` "Community languages"); they come with a maintainer.
- Mirroring the coordinate-drawn time axes (Timeline, charts, graphs).
- Arabic-Indic digits as an option.

ROADMAP.md: none (an issue).

## Capabilities

### Modified Capabilities

- `localization`: the document's direction follows the language; Arabic is a community language drafted by machine and reviewed by a speaker; right-to-left layout, input, text isolation and digits.
- `design-system`: layout names start and end; directional icons mirror; right-to-left stories in the workbench.

## Impact

- `web/src/lib/direction.ts` (new), `lib/platform.ts`, `lib/i18n/locale.ts`, `page/main.tsx`, `index.css`, the shortcut dispatcher, about 220 component files (class names), the swipe, drag and resize code, `Popover`, `Tooltip`, `scripts/ui-check.mjs`, `.storybook/preview.tsx`, `app/rightToLeft.stories.tsx`.
- Second pull request: `web/src/locales/ar.json` (one lazily loaded chunk, nothing on first load), `web/src/locales/index.ts`, `docs/translating.md`, `docs/language.md`, a changelog fragment.
- The visual baselines of every story whose layout classes changed render the same left to right; the nine new right-to-left stories need baselines (the "UI baselines" workflow).
