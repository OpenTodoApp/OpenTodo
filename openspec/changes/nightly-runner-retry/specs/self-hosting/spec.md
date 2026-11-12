## MODIFIED Requirements

### Requirement: Nightly failures are reported
The nightly checks SHALL report their result on the default branch as a GitHub issue labelled `ci-nightly`: a failed or timed-out nightly job SHALL open that issue, or comment on it when it is already open, naming the run and the failed jobs; a night on which every job passes SHALL close it. A first attempt whose only unsuccessful jobs never got a runner (GitHub gave them no hosted runner, so no step ran) SHALL NOT be reported; it SHALL be re-run once, failed and cancelled jobs only, and the re-run's result SHALL be reported as above. A job that failed on a runner SHALL never be re-run automatically, and a second attempt SHALL never be retried. The report and the retry SHALL use only the workflow's own token.

#### Scenario: A nightly job fails
- **WHEN** the race detector finds a data race in the nightly run and no `ci-nightly` issue is open
- **THEN** an issue labelled `ci-nightly` is opened with a link to the run and the failed job

#### Scenario: Still failing the next night
- **WHEN** the nightly run fails again while the `ci-nightly` issue is open
- **THEN** a comment with the new run link is added to that issue and no second issue is opened

#### Scenario: Green again
- **WHEN** every nightly job passes while the `ci-nightly` issue is open
- **THEN** the issue is closed with a link to the green run

#### Scenario: No runner for a job
- **WHEN** the iOS build of the first attempt is cancelled because GitHub never gave it a macOS runner and every other job passed
- **THEN** no issue is opened or commented on, the run's cancelled jobs are re-run once, and the second attempt's alert opens, comments on or closes the issue by its own result

#### Scenario: A real failure next to a missing runner
- **WHEN** the race detector fails and the iOS build never got a runner in the same first attempt
- **THEN** the issue is opened or commented on at once and the run is not re-run
