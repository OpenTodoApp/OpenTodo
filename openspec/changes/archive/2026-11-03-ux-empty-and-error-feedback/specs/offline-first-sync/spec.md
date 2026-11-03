## ADDED Requirements

### Requirement: Sync error visible in compact layouts

When sync fails with an error, the status control SHALL keep its text label in compact mode and SHALL show the error detail as an alert beside or below the control, not only in a tooltip. The alert SHALL be announced as an alert. When sync is idle with nothing pending, compact mode MAY keep the dot-only control.

#### Scenario: Error in the icon rail

- **WHEN** sync fails while the sidebar is in compact mode
- **THEN** the pill keeps its label and the error text is visible as an alert without hovering

#### Scenario: Healthy compact mode stays quiet

- **WHEN** sync is idle with nothing pending in compact mode
- **THEN** the control shows only its dot and no alert

#### Scenario: Error clears

- **WHEN** a later sync succeeds
- **THEN** the alert disappears and the control returns to its normal presentation
