# Proposal

## Why

Part 5 of the "Precision" redesign. `precision-shell` gave the day pages (Today, Upcoming) a large title and an empty slot under it for a briefing: one or two sentences in which the app tells you what stands out. The round-2 mock-up reads "**Three things matter today.** Your passport renewal is two days late, Friday is already full, and Mia answered about the boiler." The owner asked for "a calm briefing line at the top (what matters most, what's slipping)" and no AI for it.

Today the slot is empty, so the large head only repeats the date. The facts the sentence needs (late tasks, estimates against the day length, unread replies, tomorrow's first task) are already on the device.

## What Changes

- **A briefing sentence on Today:**
  - When something stands out: a bold lead ("Three things matter today.") and then, as one sentence, up to three facts in a fixed order:
    - late tasks (the task named with its days late when there is one, else the count), in the danger tone;
    - today past the day length, or else the first later day of the week that is already full, in the warning tone;
    - unread replies (who answered about which task when there is one, else the count), in the strong tone.
  - When nothing stands out: "Nothing stands out today." with the open count and the planned time.
- **Empty Today:**
  - "All done for today." once something was done today or the day was closed;
  - otherwise "Nothing is planned for today.";
  - either way, then tomorrow: how many tasks and the first one with its time ("Tomorrow starts with 4 tasks; the first is Standup at 9:30.").
- **Upcoming:**
  - how many tasks the next seven days hold;
  - the days that are already full, or "Every day still has room.";
  - tomorrow's first task.
- **The Daily check** opens with the same sentence as Today.
- **Rules on the device:** a pure function over the local rows, with no network, no model and no new data. Two devices with the same rows say the same thing, and the sentence follows sync and the clock like the list under it.
- **The copy grammar in every shipped language:**
  - each fact is a whole translated clause;
  - the clauses are joined by the language's own list pattern;
  - the first clause starts with a capital;
  - task titles and names are never translated.

Out of scope:
- The phone's day head: below 768 px the header row moves into the phone bar, so the briefing is not shown there yet. `precision-phone` designs the phone day head.
- The empty state's illustration and actions under the head ("Day closed at 18:42", "See tomorrow") stay as they are.
- Any assistant- or model-written text.
- Settings to turn facts on or off. The sentence has no setting.

This advances the "Precision redesign" item (change 5 of 13, after `precision-shell`).

No new environment variable and no change to the op log. Not breaking.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-app`: new "Day page briefing".
- `weekly-review`: "Daily check" opens with Today's briefing.
- `localization`: new "Sentences built from facts".

## Impact

- New `web/src/lib/briefing.ts` (pure rules) with `briefing.fixtures.json`, and `web/src/app/Briefing.tsx` (the wording and the hook).
- `TaskListView.tsx` passes the briefing to the day head; `review/DailyCheck.tsx` shows it first.
- 18 new messages in each of the five catalogs.
- No dependency and no server change; bundle impact is a few kilobytes.
