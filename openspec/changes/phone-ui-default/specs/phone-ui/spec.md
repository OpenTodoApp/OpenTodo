# Spec Delta

## ADDED Requirements

### Requirement: The phone screens are the default on a phone
Below 768 px the phone screens of this capability SHALL be shown unless the person has turned them off on that device. This replaces, in the opt-in requirement of this capability, "off until the person turns it on": the switch "New phone screens" SHALL be on until the person turns it off. Everything else of that requirement holds: the switch is offered only below 768 px, is kept on the device, is not synced, sent to the server or written as an operation, takes effect at once, and from 768 px every screen is as it is without this capability.

A device on which the person had turned the phone screens on SHALL keep them on. A device on which the person turns them off SHALL show the earlier screens until they turn them on again, also after an update of the app.

The default changes what is drawn, not what is stored: no task, project or setting of the account is read or written differently, so nothing here depends on the network, and two devices of one account may differ.

#### Scenario: A phone that never touched the switch
- **WHEN** a person opens the app on a 390 px phone after the update and has never opened the switch
- **THEN** Today is the phone list, and Settings shows the switch on

#### Scenario: Turning them off
- **WHEN** the person turns "New phone screens" off
- **THEN** every screen is the earlier one at once, and it still is after the app is closed and opened again

#### Scenario: A phone that had them on
- **WHEN** a person who had turned the phone screens on during the trial opens the app after the update
- **THEN** the phone screens are still on

#### Scenario: A wide window
- **WHEN** the app is opened in a window 768 px wide or wider on a device that never touched the switch
- **THEN** every screen is the desktop screen and Settings does not show the switch

#### Scenario: Another device
- **WHEN** the person turns the phone screens off on one phone and opens the app on a second phone
- **THEN** the second phone shows the phone screens, and no operation was written for the switch
