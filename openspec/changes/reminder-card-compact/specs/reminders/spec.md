# Spec Delta

## ADDED Requirements

### Requirement: Compact in-app reminder on touch
On a device whose pointer is coarse, and in a window narrower than 640 px, the in-app notification of "In-app delivery" SHALL be one compact card: the task's name on one line, which opens the task; the reminder's time on one line; and one row with two actions, "Snooze" and "Dismiss", each at least 44 px high and wide on touch. "Snooze" SHALL open the three snooze choices of "Snooze and dismiss" (10 minutes, 1 hour, tomorrow at 09:00) as a menu, a bottom sheet below 640 px, reachable by tap and by keyboard (Enter opens it, the arrow keys move, Enter chooses); Escape in the menu SHALL close the menu only, and Escape on the card SHALL dismiss the reminder. When several reminders are due, the card SHALL show the one that fired first and the number of the others, and the next SHALL take its place when the first is answered. The card SHALL be announced as before (an alert named "Reminder" and the task's name) and SHALL sit in the toast stack of `app-shell` "Notices are toasts", clear of the tab bar and the floating add button like every toast. After an answer, focus that was in the card SHALL move to the next card, or, when none is left, back to the element that had it before the reminder took it. With a fine pointer on a window of 640 px or more the card SHALL keep its three snooze buttons and Dismiss, one card per due reminder up to four. This is presentation only: the answers are the reminder operations of "Snooze and dismiss", written locally, queued offline and converging by last-writer-wins.

#### Scenario: A due reminder on a phone
- **WHEN** a reminder for "Renew passport" is due and the app is open on a 360 px touch screen
- **THEN** one card shows "Renew passport", the reminder's time, and "Snooze" and "Dismiss" on one row, each 44 px high

#### Scenario: Snooze from the sheet
- **WHEN** the user taps Snooze on the card on a phone and then "1 hour"
- **THEN** the sheet closes, the reminder's firing time is one hour from now as one reminder operation, and the card leaves

#### Scenario: Snooze by keyboard on a tablet
- **WHEN** focus is on the card's Snooze button at 768 px and the user presses Enter, Arrow Down, Enter
- **THEN** the menu opens with focus on "Snooze 10 min", and the reminder is snoozed by one hour

#### Scenario: Escape in the menu
- **WHEN** the snooze menu is open and the user presses Escape
- **THEN** the menu closes, focus is on Snooze, and the reminder is neither snoozed nor dismissed

#### Scenario: Several due reminders
- **WHEN** four reminders are due on a phone
- **THEN** one card shows the one that fired first with "+3 more reminders", and after it is dismissed the next one shows with "+2 more reminders" and focus on its Snooze button

#### Scenario: Offline
- **WHEN** the device is offline and the user snoozes a reminder from the compact card
- **THEN** the reminder fires again on this device at the new time, and the change uploads on reconnect

#### Scenario: A mouse on a wide window
- **WHEN** two reminders are due at 1280 px with a mouse
- **THEN** two cards show, each with "Snooze 10 min", "1 hour", "Tomorrow 09:00" and "Dismiss"
