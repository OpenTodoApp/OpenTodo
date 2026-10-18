# Proposal

## Why

An audit of the web client (UI-3, UI-4, UI-11) found three places where screen reader users get less than sighted users:

- **Chips are silent.** The full phrase of a metadata chip ("3 comments", "Has notes", "Blocked by 2", a group's "4 open tasks", the warning on a title that could not be decrypted) sat in an `aria-label` on a `<span>`. A span has no role, ARIA prohibits naming it, and screen readers ignore the name: "Has notes" was never announced at all, counts were read as bare numbers, and the undecryptable-title warning was replaced by ciphertext. The same pattern was in about fourteen places in the app.
- **The list cursor and the hierarchy are invisible.** `j`/`k` moved a highlight that only changed a class: focus stayed where it was, so a screen reader announced nothing. Subtasks were shown by indentation only. Every complete button was named "Complete task", so a list read as "Complete task, Complete task, ...".
- **Page changes are not announced.** The tab title was always "OpenTodo", navigation left focus on the sidebar link (or dropped it on the body), and there was no skip link past the sidebar.

## What Changes

- Chips (`NeutralChip`, `ToneText`) and counts carry their full phrase as visually hidden text inside the element, with the abbreviated visible text hidden from assistive technology (`ReadAs` in `web/src/ui/Chips.tsx`). Every role-less `aria-label` in the app is replaced the same way, or the element gets the role its name belongs to (a region, a group).
- A lint rule (`a11y/no-generic-aria-label`, local to `web/eslint.config.js`, no new dependency) refuses `aria-label` and `aria-labelledby` on a `<span>` or `<div>` without a role.
- The list cursor is real focus: a new cursor row takes focus on its open button (the title), unless focus is elsewhere (the task panel, a dialog, the quick add, the sidebar's find field). The cursor row is `aria-current`. Rows in the project and Inbox trees carry `aria-level`, `aria-posinset` and `aria-setsize`. Complete and reopen buttons are named "Complete {title}" / "Reopen {title}" (translated).
- The tab title names the page ("Today – OpenTodo"), a navigation the person started moves focus to the page heading (not on the first load, not while a dialog, an overlay or the task panel holds focus, not when the new page focused something itself), and a "Skip to content" link is the first Tab stop.

No op schema, API, data model or dependency change; no new environment variable. Not **BREAKING**.

**Out of scope**: tree or grid roles for the list (the rows hold several controls each, and the `j`/`k`, Tab-to-indent and drag-and-drop model would have to change to keep a tree correct; design D2); roving tabindex (Tab is the indent key in the list); the Filter view's and saved views' cursor (`useListKeys`), which can adopt the same focus rule later; the task panel's own complete button, whose panel heading already names the task. ROADMAP.md item advanced: none; this hardens existing behaviour (WCAG 2.2 AA: 1.3.1, 2.4.1, 2.4.2, 2.4.3, 4.1.2).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: names are announced (visually hidden text, not names on generic elements), enforced by lint.
- `task-list-presentation`: the cursor, the hierarchy and the complete buttons are exposed to assistive technology.
- `app-shell`: page changes are announced (tab title, focus on navigation, skip link).
