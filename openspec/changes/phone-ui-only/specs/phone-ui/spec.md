# Spec Delta

## ADDED Requirements

### Requirement: The phone screens have no switch
Settings SHALL NOT offer a switch for the phone screens, at any width, and the app SHALL NOT have a second layout for a window narrower than 768 px: such a window shows the phone screens of this capability, and nothing a person can set changes that.

A device on which an earlier version stored a choice for the switch "New phone screens" SHALL show the phone screens below 768 px whatever that choice was, and the app SHALL remove the stored choice from the device when it opens. The stored choice was never synced, sent to the server or written as an operation, so removing it writes no operation, needs no network, and leaves the person's other devices as they are.

From 768 px every screen SHALL be what it was before this requirement.

#### Scenario: A phone that had turned them off
- **WHEN** a person who had turned "New phone screens" off on a 390 px phone opens the app after the update
- **THEN** Today is the phone list, and the stored choice is gone from the device

#### Scenario: Settings
- **WHEN** a person opens Settings, then Appearance, at 390 px and at 1280 px
- **THEN** neither shows a switch for the phone screens

#### Scenario: Offline
- **WHEN** that phone opens the app after the update without a network
- **THEN** it shows the phone screens, and no operation is waiting to be sent because of it

#### Scenario: A wide window
- **WHEN** the app is opened in a window 1280 px wide before and after the update
- **THEN** Today, a project, the board, the calendar and Settings look the same
