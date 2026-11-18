# Design

## Context

- The theme document (format 1, `web/src/lib/theme/format.ts`, mirrored by `internal/themes`) has `type: { family, list }`. Both validators refuse an unknown key inside `type`, and keep and ignore an unknown top-level key (`TOP_KEY`; shared example `valid/unknown-key-kept.json`).
- `type.list` travels: `derive.ts` (`fontOf`) → `ResolvedTheme.list` → `load.ts` `toApplied` → `apply.ts` (`validApplied`, `themeCss`: `--ot-text-list` in the rule that also holds under high contrast) → the device cache `ot.theme` → `web/public/appearance.js`, which checks and writes the same text before the first paint (`appearanceBoot.test.ts` compares them).
- Every row, card and Today title is one element, `[data-row-title]` (`TaskRow.tsx` `RowTitle`), at the body weight, 400. The bundled Inter is a variable font (100 to 900).

## Decisions

**D1. A top-level key, `titleWeight`.** The natural home would be `type.title`, next to `list`. But an app or server from before this change refuses a document with an unknown key in `type`: a theme edited on an updated device would show as invalid, and fall back to the default theme, on a device still running the older code (a tab not yet reloaded, a phone that has not fetched the new app), and a theme file shared with someone on an older release would be refused. A top-level key is the format's own extension point: older code accepts the document, applies everything it knows and keeps the key. So the change is additive for every released version and the format version stays 1.

Alternatives: `type.title` with format 2. Rejected: a format bump makes every older app drop the whole theme for one optional weight. A fifth "token". Rejected: tokens are colours, checked as colours.

**D2. A closed list: 400, 500, 600, 700.** Numbers, as CSS and the variable font have them, and as `type.list` is a number. 400 is the default and is what an absent key means; the editor writes no key for Regular. Anything else is refused with the existing code `type` at the path `titleWeight` (no new refusal code, so older tooling that lists codes stays right). The applied form carries the weight only when it is 500, 600 or 700, and `validApplied` and the boot script accept exactly those three numbers, so the cached value can never add a declaration.

**D3. One variable, one rule.** `--ot-title-weight: 400` on the root; `[data-row-title] { font-weight: var(--ot-title-weight) }` in the components layer, so a weight utility on a title still wins. A theme writes the variable in the shape-and-type rule, which also matches under high contrast (weight does not affect contrast pairs). A local font without that weight is synthesised by the browser, as for any font.

**D4. The editor.** One segmented control after List text size: Regular, Medium, Semibold, Bold (words with the context `weight`, since "Medium" already exists as an energy and a size). The preview sets the variable on its own root, like the list size.

**D5. The template and the schema.** The template writes `"titleWeight"` after `type`, commented out with 400 while the theme does not set it, with a one-line note. The JSON Schema gains the property with its four values.

## Data model

No op field. The theme document, a synced value, gains one optional key; older readers keep it.

## Interface budget

One control in the theme editor's Shape and type section (a Settings sub-page, not a list screen): no chrome above a list, no task property, no sidebar destination, no scroll region, no shortcut (`docs/interface-guide.md`).

## Security

The value is a number from a closed list on every path: the document check (web and Go), the resolver, the cache check and the boot script. It is written into CSS only as that number.

## Size

No dependency. First load: a few lines in `apply.ts` and the boot script, one custom property and one rule. `make bundle-budget` stays inside the budget.
