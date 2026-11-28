# Proposal

## Why

The phone UI carries every function of the web app and reads as an app, not a shrunk website. The owner asked on 2026-11-27 for the next step: make it look like a modern phone app, attractive as well as complete, "invent what you want, widgets and so on". What still reads as a web page on a phone is the frame around the lists: a full-width bar fixed to the bottom with a hairline, a round button floating over the last rows, square-ish cards, a flat title area, and Today and Upcoming that open straight into a list with no overview of the day or the week.

## What Changes

- **A floating tab bar.** Below 768 px the tab bar is a capsule 12 px in from the sides and 8 px above the bottom safe area, translucent over the content, which scrolls on under it. The current tab sits on a pill in the selected tone. The add button sits beside the bar at its height instead of floating over the list.
- **Today at a glance.** Under Today's title, up to three tiles: Done today (a ring of the tasks completed today out of the day's), Up next (the next task at a time still ahead, or the day's first without a time; it opens the task) and Late (the tasks from earlier days; it scrolls to them).
- **Upcoming's week.** Under Upcoming's title, the next seven days as day pills with up to three dots for their tasks; a day with tasks scrolls the list to it.
- **A light at the top.** Behind the title of every phone list, two soft washes of the accent fade out before the first rows; the bar at the top is clear until the title scrolls away, then frosted.
- **Rounder cards.** A card of phone rows, a tile, the task page's cards and the date sheet's groups use a 16 px radius (`--radius-phone-card`).
- **The task page's fields to add** are a grid of tiles, three to a row, each with its icon over its name, instead of a wrap of outlined chips.

Out of scope: the desktop and every width from 768 px, the drawer, the calendar, Notes and Settings screens, the Android and iOS home-screen widgets (`android-upcoming-calendar-widgets`), any new data or function. Two new strings ("Up next", "Next seven days") in every catalogue.

Advances the ROADMAP item "Shells that feel native".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: "Phone navigation": the tab bar floats and the add button sits beside it.
- `phone-ui`: gains Today at a glance, Upcoming's week and the look of the phone lists. Its requirements are in changes not archived yet (`phone-ui-trial`, `phone-lists` and the rest), so this change only adds requirements.

## Impact

- New: `web/src/phone/components/TodayGlance.tsx`, `WeekStrip.tsx`, `web/src/phone/phoneModern.test.tsx`, their stories.
- Changed: `web/src/app/phoneFrame.tsx`, `TabBar.tsx`, `Shell.tsx` (the room under the content moves from the frame to the scroller), `useScrollDirection.ts` (the toast's lift), `web/src/phone/screens/PhoneList.tsx`, `components/PhoneHeader.tsx`, `FactRow.tsx`, `PhoneDateSheet.tsx`, `web/src/index.css` (`--radius-phone-card`, `.phone-glow`, `--add-room`), the catalogues, the visual baselines of the phone stories.
- No op field, no route, no server change, no environment variable, no dependency. The two components are in the phone UI's chunk, loaded on demand; the first load is unchanged.
