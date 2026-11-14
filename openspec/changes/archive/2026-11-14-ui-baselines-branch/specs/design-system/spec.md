## MODIFIED Requirements

### Requirement: Visual regression gate on stories
CI SHALL capture every workbench story in light and dark at 375 px and 1280 px wide and compare it with baselines. It SHALL fail when the difference exceeds a small threshold and report a diff image. Contributors SHALL be able to update baselines with one documented command. The baselines SHALL live outside main's history, on one branch that is replaced on every change; a pull request SHALL carry only the baselines it adds or changes, which the check lays over that set and which move to the branch once the pull request merges.

#### Scenario: Unintended visual change
- **WHEN** a change alters the padding of the shared button and baselines were not updated
- **THEN** the UI check fails and attaches the before, after and diff images for each affected story

#### Scenario: Intended visual change
- **WHEN** a contributor intentionally changes a component and runs the baseline update command
- **THEN** only the new or changed baselines are written for the pull request and the UI check passes

#### Scenario: Merged baselines leave main
- **WHEN** a pull request with new or changed baselines merges
- **THEN** the baselines branch is replaced with a set that includes them, they are removed from main, and main's history does not gain a copy of the other baselines

#### Scenario: Full refresh
- **WHEN** a maintainer regenerates every baseline on main
- **THEN** the baselines branch is replaced and main's history does not change
