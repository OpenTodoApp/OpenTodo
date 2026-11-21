## ADDED Requirements

### Requirement: Single sign-on handed to the apps
`GET /api/v1/auth/oidc/start` SHALL accept an app's `app_challenge` (an S256 PKCE challenge) and `app_state`, and SHALL refuse a malformed pair with 400 `invalid_request`. Such a flow SHALL always be a sign-in flow, whatever session the browser running it has. Its callback SHALL verify the identity as in "Sign-in through the provider" but SHALL NOT start a session in that browser: it SHALL answer with a confirmation page that names the account (the provider's verified email, else the name it gives, never an unverified email) with Continue and Cancel, in the browser's language among the mail texts' languages that have it, else English. The page SHALL run no script, hold no code, and be served with a policy of `default-src 'none'`, `form-action 'self' opentodo:` and `frame-ancestors 'none'`. Its form SHALL post a single-use ticket to `POST /api/v1/auth/oidc/app-continue`, which SHALL refuse a post another site declares (403 `bad_origin`). Continue SHALL redirect to `opentodo://sso` with the app's state and a single-use code, valid for two minutes from then and bound to the app's challenge. Cancel SHALL drop the sign-in and redirect to `opentodo://sso` with the app's state alone. An unknown, spent or expired ticket SHALL redirect to `/?error=oidc_state_invalid`. When the provider refused, the callback SHALL redirect to `opentodo://sso` with the error code, without a page. No code SHALL be redeemable before Continue, and one identity SHALL have at most three sign-ins waiting: a fourth SHALL replace that identity's oldest, preferring one not yet confirmed. `POST /api/v1/auth/oidc/app-session` SHALL take `{code, code_verifier}`, be public and share the start and callback routes' rate limit, refuse a request another site declares or a cookie write without a JSON body (403 `bad_origin`), and answer 400 `oidc_state_invalid` for a code that is unknown, spent, expired, issued for another issuer, or whose challenge the verifier does not match; a refused verifier SHALL spend the code. Without a session on the request it SHALL finish as the callback of a sign-in would (mapping, provisioning, refusals and second-factor rules of "Identity to account mapping"); with a session it SHALL finish as the callback of a link would, for that session's account ("Linking and unlinking from Settings"). Codes SHALL be kept in memory only; a restart SHALL abort the flows in flight. `GET /api/v1/health` SHALL announce the capability with `"app_sso": true`. No provider setting, data model or environment variable SHALL change.

#### Scenario: App sign-in
- **WHEN** an app starts the flow with its challenge and state, the person signs in at the provider, and the app posts the returned code with its verifier from its web view, which has no session
- **THEN** the browser that ran the flow has no session, the redeem answers 303 to `/` with the session cookie, and `login.succeeded` is recorded with method `oidc`

#### Scenario: App link from a signed-in web view
- **WHEN** the web view that redeems the code is signed in, within the link freshness window
- **THEN** the identity is linked to that account and the redeem answers 303 to `/settings/account/security?linked=1`, even if the browser that ran the flow was signed in as someone else

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
- **THEN** the browser shows "Continue to the OpenTodo app as ada@example.com?" with Continue and Cancel, and no code has reached the app yet
- **AND** Continue sends the browser to `opentodo://sso?code=…&state=<app state>`, and the same ticket posted again sends nothing to the app

#### Scenario: The person cancels
- **WHEN** the person taps Cancel on the confirmation page
- **THEN** the browser is sent to `opentodo://sso?state=<app state>` with no code and no error, and the sign-in can no longer be continued

#### Scenario: Provider refuses an app flow
- **WHEN** the provider returns an error to the callback of an app flow
- **THEN** the browser is redirected to `opentodo://sso?error=oidc_failed&state=<app state>` with no code

#### Scenario: Malformed app parameters
- **WHEN** the start route gets an `app_challenge` that is not an S256 challenge, or one of the two parameters without the other
- **THEN** the answer is 400 `invalid_request` and nothing is redirected
