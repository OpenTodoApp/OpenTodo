## ADDED Requirements

### Requirement: Tiered CI
CI SHALL run in tiers. A pull request SHALL run the repository checks and, when it changes code, the web, server and image checks and one server binary; the browser layout and end-to-end checks in one engine at every width when it changes the web app, the server or their scripts; the workbench accessibility and visual checks when it changes the web app's sources or the workbench; the Android, extension and skill jobs only when their own files change; and a change to the docs alone SHALL run the repository checks and the docs website check. A change to the CI workflow or its path filter SHALL run every pull request tier. A push to the default branch and a release tag SHALL run every job and every engine, width, language and platform, and SHALL publish only after all of them succeeded; a job skipped by a tier SHALL never be the reason a pull request fails.

#### Scenario: A server-only pull request
- **WHEN** a pull request changes only `internal/sync`
- **THEN** CI runs the checks, web, server, image, one binary and the single Chromium layout and end-to-end job, and skips the workbench, WebKit, translated-layout, other binary, Android, extension and skill jobs

#### Scenario: A docs-only pull request
- **WHEN** a pull request changes only files under `docs/`
- **THEN** CI runs the repository checks (including the docs check) and the docs website check, and nothing else

#### Scenario: The push runs everything
- **WHEN** that pull request is merged
- **THEN** the push run runs every layout leg (Chromium and WebKit at each width, German and French), all six binaries and the workbench checks, and the image is published only if every one of them passed
