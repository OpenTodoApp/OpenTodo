## ADDED Requirements

### Requirement: A pull request waits for few runners
On a pull request, the web app SHALL be built inside the server job, the only job of a pull request that needs it, instead of in a job of its own, so a pull request's longest chain is changed paths → server. Everywhere else the web app SHALL be built once in its own job and shared with the jobs that read its output (the image builds its own in its Dockerfile). Both SHALL run the same build, bundle budget and tests of the built app.

#### Scenario: A code pull request
- **WHEN** a pull request changes `web/src`
- **THEN** CI on the pull request runs no web build job, the server job builds the web app, checks the bundle budget and tests the built app before its Go steps, and a failure there fails the server job

#### Scenario: The queue shares one build
- **WHEN** that pull request enters the merge queue
- **THEN** the web build job runs once, and the server, layout, accessibility and binary jobs use its output
