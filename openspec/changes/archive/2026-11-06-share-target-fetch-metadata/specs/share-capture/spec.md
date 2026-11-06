## MODIFIED Requirements

### Requirement: Share target accepts only the share sheet and the app
The service worker SHALL store a `POST /share` only when the request's `Sec-Fetch-Site` is `none` or `same-origin`, and only when the share, files and text together, is at most 100 MB (a declared `Content-Length` over the cap is refused before the body is read). A request with any other `Sec-Fetch-Site` value or over the cap SHALL be redirected to the app without storing anything. A request without `Sec-Fetch-Site` SHALL NOT be stored either; it SHALL open the capture screen with no shared content and a note saying that nothing was kept because the browser did not say where the share came from, and to update the browser. The share is kept only on the device until it is saved, so offline behaviour and convergence are unchanged: saving goes through the usual ops.

#### Scenario: Share from the system share sheet
- **WHEN** the share sheet posts a photo to `/share` with `Sec-Fetch-Site: none`
- **THEN** the share is stored and the capture screen opens with it

#### Scenario: Form on another website
- **WHEN** a page on another site submits a form to `/share` (`Sec-Fetch-Site: cross-site`)
- **THEN** the app opens and nothing is stored

#### Scenario: Request without Sec-Fetch-Site
- **WHEN** a `POST /share` reaches the service worker without a `Sec-Fetch-Site` header
- **THEN** nothing is stored, and the capture screen opens empty with the note to update the browser

#### Scenario: Share over the cap
- **WHEN** a share holds files of 150 MB in total
- **THEN** the app opens and nothing is stored
