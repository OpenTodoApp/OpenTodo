## MODIFIED Requirements

### Requirement: How you work preference
Each user SHALL have a "How you work" preference with the values, each shown with its label:
- `lists` (Simple lists)
- `companion` (Lists with method hints)
- `first` (Full Open Loops method)

It SHALL be stored as an additive field of the user's personal preferences, written as an operation and synced to every device of that user only. It SHALL be editable offline, take effect at once on the editing device, and converge by last-writer-wins. A missing, empty or unknown value SHALL read as `lists`, and the client SHALL keep the stored value unchanged. The preference SHALL be included in the JSON export. Changing it SHALL never write an operation on a task, project, label or view.

#### Scenario: Existing account after upgrade
- **WHEN** a user who had the app before this change opens it
- **THEN** the preference reads `lists`, the sidebar, start view and screens are exactly as before, and no operation is written

#### Scenario: Change on one device
- **WHEN** the user picks Full Open Loops method on the laptop while the phone is offline, and the phone later syncs
- **THEN** both devices show the Open Loops sidebar, the phone without a reload

#### Scenario: Concurrent choices
- **WHEN** device A picks `companion` and device B picks `first`, both offline, and both sync
- **THEN** every device ends with the value written with the greater timestamp

#### Scenario: Unknown value from a newer client
- **WHEN** a device receives the value `coach`
- **THEN** it behaves as `lists` and writes no operation

#### Scenario: Switching back loses nothing
- **WHEN** a user in `first` mode switches to `lists`
- **THEN** every task, project, label and view is unchanged, and Next, Waiting and the Loop home stay reachable from the More group, the palette and their shortcuts

#### Scenario: Labels changed, values kept
- **WHEN** a user who chose "Companion" before this change opens Settings → How you work
- **THEN** "Lists with method hints" is selected, the stored value is still `companion`, and no operation was written

### Requirement: Choosing how you work in Settings
Settings → Account (the You group) SHALL offer "How you work" as three choices. Each choice SHALL have a one-sentence description in plain words and a "What is Open Loops?" link that opens the method overview in the Help panel. Choosing Full Open Loops method SHALL also offer, on that device only, to make the Loop home the start view, saying what the Loop home shows. Declining SHALL leave the device's start view unchanged. Below the choices the section SHALL offer "Show the start guide again", which opens the start guide of the `first-run` capability at its first step on this device; it writes nothing until a step of the guide writes, and closing the guide leaves the preference as it was.

#### Scenario: Pick Open Loops first
- **WHEN** the user picks Full Open Loops method and accepts "Open on the Loop home on this device"
- **THEN** the app opens on the Loop home on this device on the next launch, and the other devices keep their own start view

#### Scenario: Learn before choosing
- **WHEN** the user activates "What is Open Loops?" in Settings
- **THEN** the method overview opens in the Help panel beside Settings, and closing it returns to the unchanged choice

#### Scenario: Start guide again
- **WHEN** a user in `companion` mode activates "Show the start guide again" and closes the guide on its first step
- **THEN** the preference still reads `companion`, no operation was written, and Settings is as it was
