# Proposal

## Why

An audit of the web client (UI-5, UI-10, UI-17, UI-19, UI-20, UI-22; UI-16 and UI-18 were checked again) found screens that behave differently from what the user sees or chooses:

- Lookups in the DOM used translated labels: in German, French, Spanish, Italian and Portuguese the Vim `i` command did not find the task title, and moving through the list did not release a sidebar project left focused by a click (outside English); the panel's "focus back on Add" lookup broke on a translation holding a quote.
- Four list shortcuts (skip occurrence, this occurrence only, schedule, estimate) did not check the project role: a viewer of a shared project made changes locally that the server then refused.
- Today, Upcoming, the Logbook headings and the sidebar counts read the date once per render, so they kept showing yesterday after midnight while the app stayed open.
- Five confirmations and the notes link prompt used the browser's `confirm()`/`prompt()` (ownership transfer, leaving a project, revoking an invite link, undoing an import, requiring two-factor for everyone); the link prompt accepted any text, such as `javascript:`, which the note then dropped silently.
- "{n} done" in the Logbook and the estimate placeholder were English in every language; the untranslated-text check missed both shapes.
- The calendar's hour lines used a fixed `rgb()` colour that ignores themes (high contrast, dark); the colour lint checked only hex and palette classes.
- A few list actions (bulk keys, park, duplicate, this occurrence only, adding a subtask, completing from the panel) still dropped failures silently.

## What Changes

- DOM lookups use data attributes (`data-task-title`, `data-project-row`, `data-add-property`), never translated text.
- Skip, this occurrence only, schedule and estimate do nothing for a viewer, like every other editing shortcut.
- The list and the sidebar use the existing `useToday()` hook (re-read every minute and on a zone change).
- Every confirmation is the shared `ConfirmDialog`; the notes editor asks for links in a small dialog that accepts only `https://`, `http://` and `mailto:` addresses (the ones a note renders as links) and removes the link on an empty address.
- The Logbook note and the estimate placeholder go through `t()` (plural for the count); the untranslated check also reports a prop value that reads as a phrase without a two-letter word and a template literal with words under a shown key of an object literal (`note`, `label`, `title`, …).
- The calendar grid lines use the border token; the colour lint also fails literal `rgb()`, `hsl()`, `hwb()`, `lab()`, `lch()`, `oklab()` and `oklch()` values.
- The remaining silent list actions go through `act()`, which shows the failure as a toast.

No op schema, API or data model change; no new environment variable. Not **BREAKING**.

**Out of scope**: accessibility semantics of rows and chips (a parallel change); other screens' DOM lookups by role or test id (they do not depend on the language). ROADMAP.md item advanced: none; this corrects existing behaviour.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: the confirmation dialog replaces every native confirm and prompt, including the notes link prompt; the token lint covers colour functions.
- `localization`: interface lookups do not depend on the language; the translation check covers phrases without long words and assembled notes.
- `web-app`: date-dependent views roll over at midnight; editing shortcuts respect a viewer's role.

## Impact

- `web/src/app/TaskListView.tsx`, `Sidebar.tsx`, `vim/VimLayer.tsx`, `task-detail/TaskDetail.tsx`, `task-detail/Properties.tsx`, `InviteLinksSection.tsx`, `ShareDialog.tsx`, `ImportScreen.tsx`, `TwoFactorPanel.tsx`, `NotesEditor.tsx`, new `LinkDialog.tsx`, `EstimateField.tsx`, `CalendarView.tsx`; `web/src/lib/richtextEditor.ts` (the link command takes an answer that arrives later).
- `scripts/i18n/untranslated.mjs`, `web/src/ui/tokens/lint.test.ts`.
- 18 new UI strings (6 replaced), translated in every shipped catalog.
