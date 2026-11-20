# Spec Delta

## MODIFIED Requirements

### Requirement: Haptic feedback preference
Each user SHALL have a `haptics` preference, `on` or `off`, defaulting to `on`, synced like the other appearance preferences as an additive field and editable offline, converging by last-writer-wins. With it on, a device that can vibrate SHALL give a short tick (at most 15 ms) when a task is completed, when a task is created, and when a long press lifts a task for dragging; with it off, or on a device that cannot vibrate, nothing SHALL vibrate. A tick SHALL mark a deliberate moment and SHALL NOT fire on an ordinary tap such as opening or scrolling, so the feedback stays meaningful. The switch SHALL appear in Settings → Appearance only on devices that can vibrate; a client that receives an unknown value SHALL treat it as `on` and keep the stored value.

#### Scenario: Complete on a phone
- **WHEN** the preference is on and the user completes a task on a phone whose browser supports vibration
- **THEN** the device ticks once as the check mark fills, and does not tick again when the row leaves

#### Scenario: Create on a phone
- **WHEN** the preference is on and the user adds a task with quick add on a phone that can vibrate
- **THEN** the device ticks once as the task is created, and does not tick again while typing

#### Scenario: An ordinary tap does not tick
- **WHEN** the preference is on and the user taps a row to open a task
- **THEN** the device does not tick, since opening is not one of the deliberate moments

#### Scenario: Turned off on one device
- **WHEN** the user turns haptics off on their phone while offline and later opens a tablet
- **THEN** the phone stops ticking at once, the preference syncs when online, and the tablet stops ticking too

#### Scenario: Desktop hides the switch
- **WHEN** the user opens Settings → Appearance in a desktop browser without vibration support
- **THEN** no haptics row is shown and nothing is written to the preference

#### Scenario: Older device
- **WHEN** a device with an app version before this preference receives the field
- **THEN** it ignores the field and keeps syncing as before
