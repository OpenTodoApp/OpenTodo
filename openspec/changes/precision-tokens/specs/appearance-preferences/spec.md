## MODIFIED Requirements

### Requirement: Density preference
Each user SHALL have a density preference, `comfortable` (default) or `compact`, stored and synced like mode and theme as an additive preference, applied at once to task rows, group headers and the sidebar. Comfortable rows SHALL be 36 px and compact rows 32 px with a fine pointer. A client SHALL treat an unknown value as `comfortable` and keep the stored value unchanged. Touch targets SHALL stay 44 px on coarse pointers in both densities.

#### Scenario: Compact on two devices
- **WHEN** the user picks Compact on a laptop
- **THEN** rows are 32 px tall there at once and on the user's tablet after sync, where touch targets remain 44 px
