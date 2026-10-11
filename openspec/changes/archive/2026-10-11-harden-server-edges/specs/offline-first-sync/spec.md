# Spec Delta

## ADDED Requirements

### Requirement: Bounded pull pages
A pull page, including the history replay for a newly joined project, SHALL hold at most 1000 operations and SHALL end before the operation that would bring the summed size of served values above about 4 MB, reporting that more remain. A page SHALL carry at least one operation when any remain, so devices always progress. The response format SHALL not change; operations arrive in order and once, so convergence is unaffected.

#### Scenario: Many large notes
- **WHEN** a device pulls after another device saved twenty notes of 256 KB each
- **THEN** the first response carries at most about 4 MB of values and reports that more remain, and repeating the exchange delivers every operation exactly once

#### Scenario: Oversized operation
- **WHEN** the next operation alone is larger than the budget
- **THEN** the response carries that single operation, the cursor moves past it and the device continues

#### Scenario: Replay of a newly shared project
- **WHEN** a device joins a project whose history is larger than the budget
- **THEN** the history arrives in several pages with the cursor unchanged and more reported until it is complete

#### Scenario: Offline device reconnects
- **WHEN** a device that was offline for weeks reconnects
- **THEN** it pulls in bounded pages until nothing remains and ends with the same data as other devices
