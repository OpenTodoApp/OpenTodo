## MODIFIED Requirements

### Requirement: Plan mode
The client SHALL provide a Plan mode of the Calendar destination, reachable by `g` then `Shift+C`, from the sidebar's Calendar item when it was the last mode used on the device, and from the Day | Week | Month | Quarter | Plan | Year switch, showing a span of consecutive days as columns starting on the anchor day (today by default, or the day carried in the address). The view SHALL render from local data and work offline. The span SHALL be one of the presets 3, 7, 14 or 21 days, 14 by default, or a custom whole number of days from 2 to 90 chosen in the page's menu; the choice SHALL be per device and never synced. A stored span that is missing, not a whole number, or outside 2 to 90 SHALL fall back to 14.

#### Scenario: Open the plan offline
- **WHEN** the device is offline and the user presses `g` then `Shift+C`
- **THEN** fourteen columns from today render, each with its open dated tasks, and the sidebar's Calendar item opens the Plan from then on

#### Scenario: Span kept on this device
- **WHEN** the user chooses "21 days" from the page's menu and reloads
- **THEN** twenty-one columns are shown, and another device signed into the same account still shows its own span

#### Scenario: Three-day span
- **WHEN** the user chooses "3 days" from the page's menu
- **THEN** three columns from the anchor are shown, the title reads "Next 3 days" when the anchor is today, and the choice is kept on this device after a reload

#### Scenario: Custom span
- **WHEN** the user chooses "Custom…", enters 10 and saves
- **THEN** ten columns are shown, the title reads "Next 10 days", the "Custom…" item is checked and shows 10, and a reload on this device still shows ten columns

#### Scenario: Custom span bounds
- **WHEN** the user enters 0, 1, 91, 10.5 or an empty value in the custom dialog
- **THEN** the value is refused with a message, the span is unchanged, and nothing is written to the meta row

#### Scenario: An older or invalid stored row
- **WHEN** `calendar.grid` holds `planDays: 21`, `planDays: 7`, `planDays: "21"`, `planDays: 91` or no `planDays` at all
- **THEN** the Plan shows 21, 7, 14, 14 and 14 columns respectively, and the other grid preferences in the row are preserved

#### Scenario: Range switch keeps the date
- **WHEN** the user is on the Plan with the 5th of next month focused and chooses Day
- **THEN** the Day view of the 5th opens, and choosing Plan from the Week of the 18th opens a span starting on the 18th

#### Scenario: Converges without a synced preference
- **WHEN** two devices with different spans receive the same task edits while offline and later sync
- **THEN** both show the same tasks in their own number of columns; no span value is written to the op log or converges

## ADDED Requirements

### Requirement: Choosing a custom Plan span
The Plan's overflow menu SHALL list the four presets in ascending order and a `Custom…` item after them. `Custom…` SHALL open one labelled numeric field with Save and Cancel, SHALL show the current custom length when one is in use, and SHALL save through the same per-device grid-preferences write as a preset. The dialog SHALL be fully usable with the keyboard and SHALL NOT change the span until Save is chosen with a valid value.

#### Scenario: Keyboard entry
- **WHEN** the user opens the overflow menu, chooses `Custom…` with the keyboard, types 30 and presses Enter
- **THEN** thirty columns are shown and the dialog closes with focus returned to the page

#### Scenario: Cancel
- **WHEN** the user types 5 in the custom dialog and chooses Cancel
- **THEN** the dialog closes and the span remains what it was

#### Scenario: A preset clears the custom mark
- **WHEN** the span is a custom 10 and the user chooses "7 days"
- **THEN** `Custom…` is no longer checked and seven columns are shown
