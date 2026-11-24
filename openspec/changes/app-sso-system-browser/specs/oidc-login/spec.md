## ADDED Requirements

### Requirement: Single sign-on handed to the apps
`GET /api/v1/auth/oidc/start` SHALL accept an app's `app_challenge` (an S256 PKCE challenge), `app_state` and optional `app_mode` (`login`, the default, or `link`), and SHALL refuse malformed ones with 400 `invalid_request`. The mode SHALL be kept with the flow and its hand-off, whatever session the browser running it has. Its callback SHALL verify the identity as in "Sign-in through the provider" but SHALL NOT start a session in that browser: it SHALL answer with a confirmation page that names the server's host and the account (the provider's verified email, else the name it gives, never an unverified email), worded for the flow's mode, with a confirm button and Cancel, and SHALL NOT name the app that started it, in the browser's language among the mail texts' languages that have it, else English. The page SHALL run no script, hold no code, and be served with a policy of `default-src 'none'`, `form-action 'self' opentodo:` and `frame-ancestors 'none'`, with a same-origin referrer policy so that a browser names the server's origin on the page's own post. Its form SHALL post a single-use ticket to `POST /api/v1/auth/oidc/app-continue`, which SHALL refuse a post another site declares or whose origin is opaque (403 `bad_origin`). Continue SHALL redirect to `opentodo://sso` with the app's state and a single-use code, valid for two minutes from then and bound to the app's challenge. Cancel SHALL drop the sign-in and redirect to `opentodo://sso` with the app's state alone. An unknown, spent or expired ticket SHALL redirect to `/?error=oidc_state_invalid`. When the provider refused, the callback SHALL redirect to `opentodo://sso` with the error code, without a page. No code SHALL be redeemable before Continue, and one identity SHALL have at most three sign-ins waiting: a fourth SHALL replace that identity's oldest, preferring one not yet confirmed. `POST /api/v1/auth/oidc/app-session` SHALL take `{code, code_verifier}`, be public and share the start and callback routes' rate limit, refuse a request another site declares or a cookie write without a JSON body (403 `bad_origin`), and answer 400 `oidc_state_invalid` for a code that is unknown, spent, expired, issued for another issuer, or whose challenge the verifier does not match; a refused verifier SHALL spend the code. A sign-in flow's code SHALL finish as the callback of a sign-in would (mapping, provisioning, refusals and second-factor rules of "Identity to account mapping"), whatever session the request has. A link flow's code SHALL finish as the callback of a link would, for the account of the request's session ("Linking and unlinking from Settings"), and SHALL be refused without one. Codes SHALL be kept in memory only; a restart SHALL abort the flows in flight. `GET /api/v1/health` SHALL announce the capability with `"app_sso": true`. No provider setting, data model or environment variable SHALL change.

#### Scenario: App sign-in
- **WHEN** an app starts the flow with its challenge and state, the person signs in at the provider, and the app posts the returned code with its verifier from its web view, which has no session
- **THEN** the browser that ran the flow has no session, the redeem answers 303 to `/` with the session cookie, and `login.succeeded` is recorded with method `oidc`

#### Scenario: App link from a signed-in web view
- **WHEN** the app started the flow with `app_mode=link` and the web view that redeems the code is signed in, within the link freshness window
- **THEN** the identity is linked to that account and the redeem answers 303 to `/settings/account/security?linked=1`, even if the browser that ran the flow was signed in as someone else

#### Scenario: A sign-in flow never links
- **WHEN** a flow started without `app_mode=link` is redeemed by a signed-in web view
- **THEN** it finishes as a sign-in would and no identity is linked to that account
- **AND** a flow started with `app_mode=link` and redeemed without a session links nothing and starts no session

#### Scenario: The page names the server, not the app
- **WHEN** the confirmation page is shown
- **THEN** it names the server's host and the account, in words for a sign-in or for a link, and does not name the app that started the flow

#### Scenario: Wrong verifier, spent or expired code
- **WHEN** a code is redeemed with a verifier that does not match its challenge, a second time, or after two minutes
- **THEN** the answer is 400 `oidc_state_invalid` and no session is created; after a wrong verifier the code no longer works with the right one

#### Scenario: Redeem from another site
- **WHEN** a page of another origin posts a code and its verifier to the redeem route
- **THEN** the answer is 403 `bad_origin` and the code is not spent

#### Scenario: Unauthenticated redeem is the norm, rules unchanged
- **WHEN** a code whose identity has the owner's verified email is redeemed without a session
- **THEN** the answer redirects to `/?error=oidc_link_required` without a session, as the callback of a sign-in would

#### Scenario: The person confirms in the browser
- **WHEN** the provider step of an app flow succeeds
- **THEN** the browser shows "Sign in to todo.example.com as ada@example.com on this device?" with Sign in and Cancel, and no code has reached the app yet
- **AND** Continue sends the browser to `opentodo://sso?code=…&state=<app state>`, and the same ticket posted again sends nothing to the app

#### Scenario: Continue as a browser posts it
- **WHEN** the person taps Continue in a browser that sends the Origin the page's referrer policy gives
- **THEN** the post carries the server's origin and the browser is sent to `opentodo://sso?code=…&state=<app state>`
- **AND** the same ticket posted with `Origin: null` or another site's origin is refused with 403 `bad_origin` and stays usable

#### Scenario: The person cancels
- **WHEN** the person taps Cancel on the confirmation page
- **THEN** the browser is sent to `opentodo://sso?state=<app state>` with no code and no error, and the sign-in can no longer be continued

#### Scenario: Provider refuses an app flow
- **WHEN** the provider returns an error to the callback of an app flow
- **THEN** the browser is redirected to `opentodo://sso?error=oidc_failed&state=<app state>` with no code

#### Scenario: Malformed app parameters
- **WHEN** the start route gets an `app_challenge` that is not an S256 challenge, or one of the two parameters without the other
- **THEN** the answer is 400 `invalid_request` and nothing is redirected
