# Design: settings-foundation

## Context

Every settings page is built from `SettingsSection` and `SettingRow` (`web/src/ui/patterns/SettingsSection.tsx`) inside the page shell of `SettingsView.tsx`. The audit (54 pages at 1280 and 390 px) traced most of "hard to scan, no depth" to a few facts in those files:

- **Heading weight.** `SettingsSection` draws its heading as `text-meta font-medium text-muted`. `SettingRow` draws each label as `text-body font-medium text-default`, which is larger and stronger. This came from precision-settings D3 ("a label-size heading").
- **Page head.** `SettingsView` draws its page head (`data-settings-page-head`: title and lead line) only in the two-column layout from 1024 px, and its lead line only on a section, never on a sub-page (`{!sub && …}`). Phones and sub-pages have no lead line at all.
- **Titles.** Most sub-pages contain one `SettingsSection` whose `cardCopy` title equals the page's name.
- **Phone rows.** `SettingRow` stacks its control under the label below 640 px (`grid … sm:grid-cols-[…]`), switches included.
- **Primitives.** Already shared: `StatusIndicator` (tones `ok | warn | danger | busy | off`), `Checkbox` (`ui/Switch.tsx`), `Badge` (`ui/Card.tsx`), `SegmentedControl`, `Field`/`Input`/`Select`. Missing: a radio group and a number input. As a result, `QuickAddSettings`, `AssistantsPanel`, `TokensSection`, `BackupsPanel`, `RestoreSection` and `assistant/AssistantSettings` render raw `type="radio"`, and six settings files render raw `type="number"`.
- **Saving.** Each panel saves in its own way. Some switches autosave. The Attachments switch waits for Save. `BrandingPanel` mixes three models, and the audit settings mix two. A leave guard exists in the router (`setLeaveGuard`), used today only by the theme editor.

## Goals / Non-Goals

**Goals.**
- Every page says what it is for and whom it affects.
- Headings carry a page; no page repeats its own title.
- States that block people are visible.
- Two missing primitives, so no screen hand-builds radios or number fields.
- Shorter phone pages.
- One save rule.

**Non-Goals.**
- Moving pages.
- New page-level patterns (connection card, collection list, danger zone, advanced disclosure).
- Rewriting copy beyond lead lines.

Those belong to `settings-patterns` and `settings-architecture`.

## Decisions

### D1 — The page head carries the title's job, on every page and width
`SettingsView` renders the page head on every page:
- the title (from 1024 px; below that the phone bar already shows it);
- the lead line;
- the scope line;
- optional status and action slots.

The lead line comes from a new `lead` entry per section and per sub-page in the settings copy table (`lib/settingsCopy.ts`). That way it falls under the same 90-character lint and translation flow as every other settings string. Today's section descriptions (`section.description(user)`) become the section lead lines unchanged.

*Alternative rejected:* reusing the first section's description as the lead line on every page. It does work for one-section pages (D2), but multi-section pages need a sentence about the page, not about their first section.

### D2 — One-section pages drop their section heading
`SettingsPageContent` already knows how many panels a page renders. When there is exactly one, it passes `bare` to that panel's `SettingsSection`, which then renders no heading and no line. The section's line moves into the page head as its lead, unless the page has its own `lead` entry. The section stays a `<section>` labelled by the page title (`aria-labelledby` the page heading), so landmarks and the settings search anchors keep working.

The anatomy test (`settingsAnatomy.test.tsx`) gains two checks:
- no rendered page shows a section heading equal to its title;
- every page renders a lead line.

### D3 — Heading rank
`SettingsSection`'s heading becomes `text-body font-semibold text-strong`. That is the same size as a row label, but heavier and in the strong colour. Sections also get a larger gap above them (`space-y-10` instead of 8 in the page column). Together these are enough contrast in both themes without breaking the "Secondary text is one size" rule, and without bringing back the card surfaces precision-settings removed.

*Alternative rejected:* a larger heading (`text-h3`). In mock-ups it competed with the 22 px page title, and it makes one-row sections look heavy.

### D4 — Scope as data, shown in words
`SettingsPage` and `SettingsSection` gain `scope?: 'server' | 'device'`; an absent scope means the viewer's account.
- **Server group:** every page of People and Server gets `server` from the section default.
- **Device pages:** Calendar grid, and the device-only parts of Notifications, Quick add and Keyboard.

The page head shows the scope as words, in a muted line with an icon:
- server: "Applies to everyone on this server";
- device: "This device only".

Account scope needs no line.

Some personal pages also hold owner switches today (MCP, CalDAV, Delivery channels, Calendar feeds and sync, Issues, Webhooks' private-network policy). Those switches are rows inside the page's one personal section, not sections of their own. So the row gets `scope="server"` on `SettingRow`, which renders a small "This server" badge after its label for the owner. Moving those switches is `settings-architecture`'s job. This only stops them looking personal in the meantime. The Assistant page already heads its owner rows "For everyone on this server" and needs nothing more.

### D5 — Tones from a small rule, not per page
A row's `status` keeps using `StatusIndicator`. The panels that compute a state choose its tone by one rule:

| State | Tone |
|---|---|
| Working | `ok` |
| Switched off on purpose | `off` |
| Keeps the feature from working, or leaves people without a way back in | `warn` |
| Failing now | `danger` |

The `warn` cases named in the audit:
- no backup has run;
- outgoing email not configured;
- two-factor off;
- push permission blocked;
- a webhook failing (`danger`).

The overview reads the same tone. The overview's state loaders (the ones that already produce "On", "Off", "2") return `{ text, tone }` instead of a string, and the overview row renders a `StatusIndicator` when the tone is `warn` or `danger`, keeping plain text for neutral values so the overview stays calm.

### D6 — Switch rows stay inline on phones
`SettingRow` detects a switch control (`isValidElement(control) && control.type === Switch`) and then keeps a two-column grid at every width. The label and switch share a line, and the description wraps under the label. Detecting the control covers the switch rows (24 `control={<Switch` call sites today) without touching each call. An `inline` prop marks a switch the detection cannot see (one wrapped in another component), and a `stack` prop forces the old behaviour if a row ever needs it. The switch's 44 px touch target is already part of `Switch`.

### D7 — RadioGroup and NumberInput
- **`ui/RadioGroup.tsx`:**
  - Props: `label`, `value`, `onChange`, `options: {value, label, description?, disabled?, reason?}[]`, `variant: 'cards' | 'list'`.
  - Built on native `<input type="radio">` inside `<label>`, so the browser gives the roving keyboard behaviour and group semantics for free. Visually hidden inputs, with an accent mark drawn from tokens.
  - The cards variant replaces the hand-built cards in the MCP token step and the assistant settings; the list variant replaces Quick add's and Backups' radios.
  - A UI lint rule (`make ui-lint`, as for emoji icons) refuses `type="radio"` under `web/src/app`.
- **`ui/NumberInput.tsx`:**
  - Wraps `Input` with `inputMode="decimal"` (or `numeric`), `min`/`max`/`step`, a unit suffix inside the field (a token-styled span positioned after the value, which the field's `aria-describedby` reads), and an optional `unlimited` checkbox that clears and disables the field.
  - It is a text input, not `type="number"`, to avoid scroll-wheel changes and locale problems. The value is parsed on change. Out of range shows `Field`'s error with the range and reports invalid to the save bar.

### D8 — The save rule and the save bar
- **Single controls save on change**, as most already do. The Attachments switch, the audit IP switch's neighbours and Branding's theme picks are brought in line.
- **No success toast.** The control's own state is the confirmation, and a toast per switch would be noise next to the task toasts that share the one region.
- **Failure:** the control reverts and an inline error appears under its row.
- **Multi-field forms** use a new `ui/patterns/SaveBar.tsx` and a hook, `useDraft(saved)`, which returns `draft`, `set`, `dirty`, `reset` and `invalid`. The bar is a sticky strip at the bottom of the settings column. It shows only while `dirty`, holds "Unsaved changes", Discard and Save, and disables Save while `invalid` or offline.
- **Leaving:** while any draft on the page is dirty, the page installs the router's leave guard, which asks before navigating away. This is the same mechanism as the theme editor.
- **First users:** Attachments limits, Focus timer, Workspaces name and colour, Outgoing email, SSO, Speech to text, and the audit retention.

Forms that today open from an action into a dialog keep their dialog. A dialog has its own Save and needs no bar.

## Interface budget

Settings pages are not list screens, so the 2-rows-of-chrome rule above a list does not apply. The page head adds:
- one lead line, which phones did not have before;
- one scope line, only on server or device pages.

On phones D6 roughly balances that: measured with `settings-heights.mjs` (owner, every feature on), the 53 pages total 1.3% less height at 390 px and 0.1% more at 1280 px. Pages with several switches are 80 to 206 px shorter on a phone (Profile, Focus timer, AI assistants, Assistant, Push), and pages with few switches grow by the new head (Security and Keyboard about 75 px). The earlier estimate of a third was wrong: a switch row only saves the line its stacked switch took.
- No new scroll regions (the save bar is sticky inside the existing column).
- No new sidebar destinations.
- No new shortcuts.
- `settings-heights.mjs` must not report a page that grew past 1.5 screens.

## Data model, size and dependencies

- **Data:** no op, field, table, route or environment variable changes. Settings remain server or device state.
- **Dependencies:** none.
- **Bundle:** the two primitives, the save bar and the hook load only with the pages that use them (Settings is a lazy chunk). `SettingsSection` and `SettingRow`, however, sit in the shared `ui` chunk the shell loads first, so the page context, the switch detection and the badge add about 0.5 KB to the first load (measured 680.6 → 681.1 KB on the branch, 682.0 → 682.5 KB after main's own growth); that fits main's 683 KB budget, so the budget is unchanged. The page leads live in the lazy `SettingsView`, not in the copy table the shell loads.
- **Image size and server memory:** unchanged.

## Risks / Trade-offs

- **Screenshot churn.** Nearly every settings story changes once. Accept it in one baseline update per PR, after inspecting the diffs (no error states baked in).
- **Copy volume.** Lead lines for about 50 pages, in six languages, through the i18n check. They are written once, each at most 90 characters.
- **Hidden one-section pages.** Some pages render a second panel only in some states (Security with passkeys, Users with invitations). D2 counts rendered panels, so a page can gain its headings when its state changes. That is correct, but it must be tested on those two pages.
- **Switch detection.** Detecting the switch by element type misses a switch wrapped in another component (for example a Tooltip). Those rows keep stacking until they pass the `inline` prop. The anatomy test lists switch rows that stack, so they are found.

## Migration Plan

Three PRs, each releasable:
1. The primitives (`RadioGroup`, `NumberInput`, `SaveBar` with `useDraft`) with stories and tests, plus the UI lint for raw radios. Settings files are not changed yet; the lint gets an allow-list of the current offenders.
2. The page head, heading rank, one-section rule, scope and switch rows, with copy and baselines.
3. Tones, then each panel moved to the save rule and the primitives, removing allow-list entries until the list is empty.

Rollback is a revert. Nothing is stored differently.

## Open Questions

- Should the "This server" badge on owner switches inside personal pages also link to Server settings? Deferred to `settings-architecture`, which moves them.
