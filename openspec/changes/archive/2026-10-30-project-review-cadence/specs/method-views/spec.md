# Spec Delta

## ADDED Requirements

### Requirement: Maintenance projects are not flagged
A project in maintenance (project-organization "Maintenance status") SHALL never be stalled and never be listed as without a next action: not in the weekly review's project walk and summary, not in the Loop home's Place count and not in the weekly email digest. Its tasks SHALL stay actionable under the usual rules and appear in Next. These SHALL be derived on the device and on the server from synced rows, with no write, and the web app and the server SHALL agree, checked by cases in the shared next-action vectors.

#### Scenario: Low-burn project without a next step
- **WHEN** "Garden" is in maintenance, has only Someday tasks and its oldest open task is two months old
- **THEN** it is neither stalled nor without a next action in the review, on the Loop home or in the digest

#### Scenario: Next action still listed
- **WHEN** "Garden" is in maintenance and has the actionable task "Water roses"
- **THEN** Next lists "Water roses" under its context as before
