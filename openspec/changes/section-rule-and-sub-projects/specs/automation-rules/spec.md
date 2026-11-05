## ADDED Requirements

### Requirement: Where rules can be made
The items that open the routine editor on a rule made from something else, "Make an automation rule" in a saved view's menu, in a board column's Rule dialog and in a section's menu (OpenSpec `sections-and-boards` "Make a rule from a section"), SHALL be shown only while the server runs rules: the owner's automations switch as `GET /api/v1/me` reports it in `automations.enabled` (off on a demo instance). The device SHALL remember the last answer so the items show the same offline, read it again when sync starts and after the owner changes the switch, and treat an unknown answer as off. A user's own "Pause all routines" SHALL NOT hide the items.

#### Scenario: Owner turns automations off
- **WHEN** the owner turns off Settings → Server → Automations and opens a saved view's menu
- **THEN** the menu has no "Make an automation rule" item, and the item is back once the switch is on again

#### Scenario: Offline
- **WHEN** a user whose server runs rules opens a section's menu without a connection
- **THEN** "Make an automation rule" is offered, as it was when the device was last online
