## ADDED Requirements

### Requirement: An exchange never stops the sync loop
The client SHALL give up an exchange that has made no progress for 2 minutes, whatever step it waits on. A given-up exchange SHALL write nothing more. The status SHALL show an error, the edits SHALL stay queued, and the next exchange SHALL run with the usual backoff. Sign-out and passing the sync lock to another tab SHALL NOT wait on a given-up exchange.

#### Scenario: A step of the exchange never finishes
- **WHEN** the tab that runs the sync loop still answers the other tabs, but one step of its exchange never settles
- **THEN** within about two minutes the status shows an error, and the next exchange sends the queued edits and pulls what other devices wrote

#### Scenario: A slow first copy
- **WHEN** a first sync pulls many pages over several minutes, each page answered within the request deadline
- **THEN** the exchange is not given up
