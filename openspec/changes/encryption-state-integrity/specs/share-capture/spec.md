## ADDED Requirements

### Requirement: Share target accepts only the share sheet and the app
The service worker SHALL store a `POST /share` only when the request's `Sec-Fetch-Site` is `none` or `same-origin`, or the header is absent (older browsers), and only when the share, files and text together, is at most 100 MB (a declared `Content-Length` over the cap is refused before the body is read). Any other request SHALL be redirected to the app without storing anything.

#### Scenario: Share from the system share sheet
- **WHEN** the share sheet posts a photo to `/share` with `Sec-Fetch-Site: none`
- **THEN** the share is stored and the capture screen opens with it

#### Scenario: Form on another website
- **WHEN** a page on another site submits a form to `/share` (`Sec-Fetch-Site: cross-site`)
- **THEN** the app opens and nothing is stored

#### Scenario: Share over the cap
- **WHEN** a share holds files of 150 MB in total
- **THEN** the app opens and nothing is stored
