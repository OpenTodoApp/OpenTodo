## ADDED Requirements

### Requirement: Task completion sound preference

Settings → Appearance → Theme and density SHALL offer a keyboard-accessible **Task completion sound** switch beside **Haptic feedback** when both controls are available. Sound SHALL be off for new and existing accounts unless explicitly enabled. The switch SHALL be independent of haptics and Focus alerts. An explicit on/off preference SHALL take effect locally while offline and sync to the user's other devices with last-writer-wins. Missing or unknown values SHALL read as off without a corrective write.

#### Scenario: First use
- **WHEN** the user opens Appearance with no saved value on a device that supports completion sound
- **THEN** the sound switch is off and toggling it does not change Haptic feedback or any Focus option

#### Scenario: Opt in offline
- **WHEN** the user enables the sound offline and the devices later sync
- **THEN** the active device uses the preference immediately and the latest explicit preference wins on the user's other devices
