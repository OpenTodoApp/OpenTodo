# Spec Delta

## ADDED Requirements

### Requirement: Designed pressed states on touch
On a touch screen (a coarse main pointer) the controls a phone uses most SHALL show a pressed colour from the design tokens while a finger is on them, and SHALL return to their resting look at release:

- **The selected surface** for a tab of the tab bar, a row of the drawer or sidebar, a menu item, and a task row's own controls: the checkbox, Show details, the subtask chevron and the grip. A destructive menu item SHALL take the soft danger colour instead.
- **The darker accent** (the accent's hover colour) for the floating add button.
- **The selected-row surface** for a task row, while the finger is on the row's body (the part that opens the task). A press on a control inside the row SHALL tint that control and not the row, and the tint of a hold that arms the row's menu SHALL replace the pressed one.

A control with a designed pressed state SHALL NOT also dim: the generic dim ("Touch behaves like an app") is the fallback for every control without one. The pressed colour SHALL appear without a transition, so it is the same when the system asks for reduced motion. The colour of a row control's 44 px target SHALL stay within 28 px around its glyph, so it never covers the title or the control beside it. A disabled control SHALL show no pressed state.

The colours SHALL come from the theme's tokens, so light, dark, high-contrast and custom themes each show their own. With a mouse or trackpad as the main pointer nothing SHALL change: hover, focus and pressed states stay as they were. This is presentation only: nothing is stored or synced, and it is the same offline.

#### Scenario: Pressing a tab
- **WHEN** a person puts a finger on Today in the tab bar on a phone
- **THEN** the tab shows the selected surface at full opacity while the finger is down, and its resting look when the finger lifts

#### Scenario: Pressing the add button
- **WHEN** a person puts a finger on the add button on a phone
- **THEN** the button shows the darker accent at full opacity, not a dimmed accent

#### Scenario: Pressing a menu item
- **WHEN** a menu is open as a sheet on a phone and a person puts a finger on Delete
- **THEN** the item shows the soft danger colour, and any other item shows the selected surface

#### Scenario: Pressing a row's body
- **WHEN** a person puts a finger on a task's title in the Inbox on a phone
- **THEN** the whole row shows the selected-row surface and the title keeps its full opacity

#### Scenario: Pressing a row's checkbox
- **WHEN** a person puts a finger on a task's checkbox on a phone
- **THEN** a 28 px circle of the selected surface shows around the checkbox, the title beside it is not covered, and the row is not tinted

#### Scenario: A control without a designed state
- **WHEN** a person puts a finger on a label chip on a phone
- **THEN** the chip dims while the finger is down, as before

#### Scenario: A mouse is unchanged
- **WHEN** a person presses a tab, a menu item or a row with a mouse in a 360 px window
- **THEN** the control looks as it did before this change
