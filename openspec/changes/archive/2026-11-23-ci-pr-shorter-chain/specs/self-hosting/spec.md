## MODIFIED Requirements

### Requirement: Tiered CI
CI SHALL run in tiers. The path tier SHALL run the repository checks and, when a change touches code, the web, server and image checks and one server binary; the browser layout and end-to-end checks in one engine at every width when it changes the web app, the server or their scripts; the workbench accessibility and visual checks and the accessibility gate on real screens when it changes the web app's sources or the workbench; the Android, iOS, extension and skill jobs only when their own files change; and a change to the docs alone SHALL run the repository checks and the docs website check, and outside pull requests the site bundle. A change to the CI workflow or its path filter SHALL turn on every job of the path tier (on a pull request or a push to the default branch, every job of their fast tier; the queue runs the rest). The merge queue SHALL run the whole path tier for what the queued change adds, and its result SHALL be the check that lets a change reach the default branch. A pull request, draft or not, SHALL run the path tier without the browser layout and end-to-end, workbench, real-screen accessibility, Android, iOS, binary and site bundle jobs, which the merge queue runs before the change lands. A push to the default branch SHALL run the path tier for what it changed since the commit before, without the browser layout and end-to-end, workbench, real-screen accessibility, Android and iOS jobs, which the merge queue ran on the same tree; the image, its publishing and the CI result SHALL still run on it. A release tag, the nightly run and a run by hand without a base SHALL run every job and every engine, width, language and platform, and a release SHALL publish only after all of them succeeded; a job skipped by a tier SHALL never be the reason a pull request or a queued change fails.

#### Scenario: A server-only pull request
- **WHEN** a pull request changes only `internal/sync`
- **THEN** CI on the pull request runs the checks, web, server and image, and skips the binary, layout and end-to-end, workbench, accessibility, Android, iOS, extension and skill jobs

#### Scenario: The queue runs the heavy jobs
- **WHEN** that pull request enters the merge queue
- **THEN** the queue's run also runs the single Chromium layout and end-to-end job and the linux/amd64 binary, and the change reaches the default branch only if every job of that run passed

#### Scenario: A failure only the queue finds
- **WHEN** a pull request changes `web/src` so that a workbench screenshot differs, and enters the merge queue
- **THEN** the queue's visual check fails, the change does not reach the default branch, and the failed run carries the report with the new screenshots

#### Scenario: The push after a queue merge
- **WHEN** a change that touches `web/src` lands on the default branch through the merge queue
- **THEN** the push run runs the checks, web, server, image and one binary, publishes the image when they pass, reports the CI result, and skips the layout, workbench, accessibility and phone jobs the queue already ran

#### Scenario: A docs-only pull request
- **WHEN** a pull request changes only files under `docs/`
- **THEN** CI runs the repository checks (including the docs check) and the docs website check, and nothing else

#### Scenario: The push runs everything
- **WHEN** a release tag is pushed
- **THEN** the run runs every layout leg (Chromium and WebKit at each width, German and French), all six binaries and the workbench checks, and the image is published only if every one of them passed
