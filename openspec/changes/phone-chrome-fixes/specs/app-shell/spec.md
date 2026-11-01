## ADDED Requirements

### Requirement: No floating add button on Settings
Below 768 px the shell SHALL hide the floating add button while Settings is open, because Settings has no quick-add action and the button would cover the chevrons at the end of its rows. The tab bar SHALL stay. The button SHALL return on the next view that offers quick add, and SHALL remain available while a quick-add sheet opened from another view is open.

#### Scenario: Settings on a phone
- **WHEN** the user opens Settings on a 390 px phone
- **THEN** the tab bar stays visible, the floating add button is gone, and none of Settings' row chevrons is covered
