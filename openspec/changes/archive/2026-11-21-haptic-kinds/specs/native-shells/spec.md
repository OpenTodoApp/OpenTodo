## ADDED Requirements

### Requirement: Haptic kinds for outcomes and selection
The shells SHALL accept the haptic kinds `warning`, `error` and `selection` besides `tick` and `success`, map each to the platform's own feedback, and play `tick` for a kind they do not know. On a device without haptics, nothing SHALL play. It changes no data, so offline behaviour and convergence are unaffected.

#### Scenario: An older shell
- **WHEN** the page asks a shell that knows only `tick` and `success` for `selection`
- **THEN** the shell plays `tick` and reports no error
