# Spec Delta

## ADDED Requirements

### Requirement: The phone screens are the default on a phone
Below 768 px the phone screens of this capability SHALL be shown on every device without anyone opening Settings: in the Android and iPhone apps, in a phone's browser and in the installed web app. A device that had turned the phone screens on while they were a trial SHALL keep them, and a device that had never chosen SHALL show them. From 768 px every screen is as it is without this capability.

What is shown changes what is drawn, not what is stored: no task, project or setting of the account is read or written differently, so nothing here depends on the network, and nothing is written as an operation.

#### Scenario: A phone that never chose
- **WHEN** a person opens the app on a 390 px phone after the update and had never turned the trial on
- **THEN** Today is the phone list

#### Scenario: A phone that had them on
- **WHEN** a person who had turned the phone screens on during the trial opens the app after the update
- **THEN** the phone screens are still shown

#### Scenario: A wide window
- **WHEN** the app is opened in a window 768 px wide or wider
- **THEN** every screen is the desktop screen
