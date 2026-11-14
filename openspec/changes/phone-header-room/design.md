# Design

## Context

Below 768 px (`DESKTOP_HEADER_QUERY`) a page's `PageHeader` writes its title, actions, menu and Help screen to the page-bar store, and the shell's `PhoneBar` draws them through `PageActions`: the actions, then `menu` (a complete menu element the page built: `ActionMenu` for a project, `InboxMenu`, `ViewMenu`, the note menus) or the default overflow `Menu` around `overflow`, then the Help `IconButton`. From 768 px the same `PageActions` sits in the header's own row.

Measured at 360 px on the seeded account: the bar's title column is 42 px on the Inbox (lead line "3 to …") and 104 px on a project; each bar control is 48 px.

A page's own menu is built in many places, but every one of them ends in the overlay `Menu` with `kind="menu"` (`web/src/ui/overlay/Menu.tsx`). There is no overflow mechanism by width: a page decides what goes into the bar's two slots and what joins its menu (`barActions`, `PhoneMenuItems`).

## Goals / Non-Goals

**Goals:** Help out of the phone bar wherever a menu can take it; nothing lost where none can; no change per screen.

**Non-Goals:** a general "collapse by width" bar; moving other controls; changing the header from 768 px.

## Decisions

### D1. The menu draws what its surroundings hand it

`MenuTailContext` (in `web/src/ui/Menu.tsx`) carries `{ render(trigger), claim() }`. The overlay `Menu`, when `kind="menu"`, draws a separator and `render(trigger)` after its own items, inside the same roving container, so the arrow keys, End and type-ahead reach it. It resets the context for its content, so a menu nested inside never repeats the items.

`PageActions` gets `helpInMenu` (set only by `PhoneBar`): it provides the context around `menu` and the overflow `Menu`, with a `MenuItem` named Help that calls `openHelp(screen, trigger)`. The trigger is the menu's button, so the guide returns focus there.

Alternative: pass a Help item into each page's menu (`InboxMenu extra`, `ActionMenu groups`, …). Rejected: one more call site per page menu, and the next page with its own menu would silently lose Help on phones.

### D2. The button stays unless a menu took the item

A menu calls `claim()` while it is mounted and able to hold the item; `PageActions` hides the Help button only while a claim is held. So a page without a menu (Settings), or with something else in the `menu` slot (a plain button, a panel with form controls), keeps the button without anyone listing those pages.

A menu claims from the first time it is `kind="menu"` and keeps the claim while a picker step turns it into a dialog (`ActionMenu`), so the bar does not change behind an open sheet.

Alternative for menu-less pages: rely on Help in the drawer's account menu. Rejected: that opens the guide's front page, not the screen's section, and those bars have room.

### D3. No shortcut on the item

The header's Help button has no shortcut of its own; `g` then `?` opens the Help page and stays as it is. The item therefore shows none.

### Data model, size

No data model impact: no field, op, route or setting. No dependency; the first load grows by a few hundred bytes (one context, one effect), inside the budget.

### Interface budget

The phone bar loses one control on pages with a menu; nothing is added above a list (still two rows of chrome: the bar and the quick add). No new destination, scroll region, task property or shortcut.

## Risks / Trade-offs

- Help is one tap further on phone pages with a menu. It is the least used control of the bar, and the menu's last item is a fixed place.
- A submenu of `ActionMenu` is the same `Menu`, so Help also ends a submenu's list. Harmless, and it keeps the rule to one line.

## Open Questions

- A long project name is still cut at 360 px (152 px for the title beside Filter, Display options and the menu). Moving Filter into the project menu on phones would give it 200 px. Not done here; it changes how fast a filter is reached.
