# Spec Delta

## MODIFIED Requirements

### Requirement: Choosing how you work in Settings
Settings → Account (the You group) SHALL offer "How you work" as three choices. Each choice SHALL have a one-sentence description and a "Learn the method" link that opens the method overview in the Help panel. Choosing Open Loops first SHALL also offer, on that device only, to make the Loop home the start view. Declining SHALL leave the device's start view unchanged. Below the choices the section SHALL offer "Show the start guide again", which opens the start guide of the `first-run` capability at its first step on this device; it writes nothing until a step of the guide writes, and closing the guide leaves the preference as it was.

#### Scenario: Pick Open Loops first
- **WHEN** the user picks Open Loops first and accepts "Open on the Loop home on this device"
- **THEN** the app opens on the Loop home on this device on the next launch, and the other devices keep their own start view

#### Scenario: Learn before choosing
- **WHEN** the user activates "Learn the method" in Settings
- **THEN** the method overview opens in the Help panel beside Settings, and closing it returns to the unchanged choice

#### Scenario: Start guide again
- **WHEN** a user in `companion` mode activates "Show the start guide again" and closes the guide on its first step
- **THEN** the preference still reads `companion`, no operation was written, and Settings is as it was
