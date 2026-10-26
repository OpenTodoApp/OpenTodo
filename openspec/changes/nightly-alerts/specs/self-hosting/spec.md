## ADDED Requirements

### Requirement: Nightly failures are reported
The nightly checks SHALL report their result on the default branch as a GitHub issue labelled `ci-nightly`: a failed or timed-out nightly job SHALL open that issue, or comment on it when it is already open, naming the run and the failed jobs; a night on which every job passes SHALL close it. The report SHALL use only the workflow's own token.

#### Scenario: A nightly job fails
- **WHEN** the race detector finds a data race in the nightly run and no `ci-nightly` issue is open
- **THEN** an issue labelled `ci-nightly` is opened with a link to the run and the failed job

#### Scenario: Still failing the next night
- **WHEN** the nightly run fails again while the `ci-nightly` issue is open
- **THEN** a comment with the new run link is added to that issue and no second issue is opened

#### Scenario: Green again
- **WHEN** every nightly job passes while the `ci-nightly` issue is open
- **THEN** the issue is closed with a link to the green run
