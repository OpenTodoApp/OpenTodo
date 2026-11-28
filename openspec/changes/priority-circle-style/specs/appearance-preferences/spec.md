## ADDED Requirements

### Requirement: Priority circles preference

Settings → Appearance SHALL offer a personal **Priority circles** preference with **Filled** and **Outline only**. The same choice SHALL apply to open-task completion circles in desktop and phone task lists, including cards, and task details. **Filled** SHALL use a stronger fill for P1 and a lighter fill for P2. **Outline only** SHALL leave both centres empty. Both modes SHALL retain the blue P3 outline, neutral P4 outline and the completed check style. The preference SHALL apply offline and converge by last-writer-wins on the account's devices.

#### Scenario: An existing account

- **WHEN** the stored preference is absent or unrecognised
- **THEN** Filled is selected and P1 and P2 use their respective fills

#### Scenario: Select Outline only

- **WHEN** the user chooses Outline only
- **THEN** desktop and phone lists and the task details reflect it without changing task priorities or completion state

#### Scenario: Switch offline

- **WHEN** the user changes the setting offline and reloads the app
- **THEN** the selected value remains in effect and syncs with the other devices after reconnecting

#### Scenario: Conflicting changes

- **WHEN** two devices change the preference independently
- **THEN** the latest operation by the account's normal ordering wins on both
