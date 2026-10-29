# Spec Delta

## ADDED Requirements

### Requirement: Adding a way to sign in needs a recent sign-in
For a cookie session, starting or finishing passkey registration, starting or confirming authenticator-app enrolment, and linking a new single sign-on identity from Settings SHALL require a sign-in or re-authentication within the last ten minutes; an older session SHALL get a 403 `reauth_required` error (a browser returning from the provider is sent back to Settings with that indication) and nothing SHALL be stored. Requests authenticated by a bearer token SHALL need the `admin` scope on these routes. Adding a credential SHALL NOT itself count as re-authentication: confirming an authenticator app marks the second factor as satisfied for the session but does not renew its re-authentication time, and linking a new identity does not either. Completing the provider flow with an identity already linked to the account SHALL still re-authenticate the session. A fresh sign-in counts as recent, so enrolment right after signing in (including enrolment the owner's policy requires) needs no extra step. These are server-side account changes that require a network connection; nothing is queued offline.

#### Scenario: Older session adds a passkey
- **WHEN** a session that signed in more than ten minutes ago requests passkey registration options
- **THEN** the response is a 403 `reauth_required` error, and after the user re-authenticates with the password or a code the web app repeats the request and the ceremony continues

#### Scenario: Older session enrols an authenticator app
- **WHEN** a session that signed in more than ten minutes ago starts or confirms authenticator-app enrolment
- **THEN** the response is a 403 `reauth_required` error and no secret is stored or activated

#### Scenario: Enrolment does not renew the sign-in
- **WHEN** a user who signed in nine minutes ago confirms an authenticator app and two minutes later creates an API token
- **THEN** the token request is answered with a 403 `reauth_required` error

#### Scenario: Older session links a new provider identity
- **WHEN** a session that signed in more than ten minutes ago completes the provider flow with an identity not yet linked to any account
- **THEN** nothing is linked, the browser returns to Settings with `error=reauth_required`, the session is still not fresh, and the web app asks for the password or a code and then starts the link again

#### Scenario: Provider re-authentication with a linked identity
- **WHEN** a session that signed in more than ten minutes ago completes the provider flow with an identity already linked to its account
- **THEN** the session counts as re-authenticated and the browser returns to Settings with `reauthenticated=1`

#### Scenario: Token scope
- **WHEN** a `full` API token calls any of these routes
- **THEN** the response is a 403 `insufficient_scope` error; an `admin` token is accepted without a re-authentication step

#### Scenario: Anonymous request
- **WHEN** a request without credentials calls a passkey registration or enrolment route
- **THEN** the response is a 401 `unauthorized` error
