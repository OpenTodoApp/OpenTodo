## RENAMED Requirements

- FROM: `### Requirement: Dynamic registration only for Google`
- TO: `### Requirement: Dynamic registration only for known connector platforms`

## MODIFIED Requirements

### Requirement: Owner-managed clients

The owner SHALL create clients through `GET`, `POST` and `DELETE /api/v1/settings/mcp/clients`, each with a name, a scope of `read` or `agent` and a redirect list, and `POST` SHALL return the client secret exactly once and never again. A member SHALL be refused with 403. `POST` SHALL take either `platform` (`google`, `openai` or `anthropic`), which gives the client that platform's redirect addresses, or `redirect_uris`, each of which SHALL be an absolute `https` address with a host, without user information, fragment, white space or `*`, at most 2,000 bytes, at most ten addresses, and SHALL then be matched exactly. With neither, the client SHALL get Google's addresses. Both together SHALL be refused with 400 `bad_request`, an unknown platform with 400 `bad_request`, and an address that breaks a rule with 400 `invalid_redirect_uri`, creating no client. `GET` SHALL also list each platform's id, name and redirect addresses. Clients are server state, not ops: offline behaviour and convergence are unaffected.

#### Scenario: The secret is shown once

- **WHEN** the owner creates a client and then reads the client list
- **THEN** the create response carries the secret and the list reports only that a secret is set

#### Scenario: A member cannot manage clients

- **WHEN** a member calls `POST /api/v1/settings/mcp/clients`
- **THEN** the response is 403 and no client is created

#### Scenario: A client made for ChatGPT

- **WHEN** the owner creates a client with `platform` `openai`
- **THEN** its redirect addresses are `https://chatgpt.com/connector_platform_oauth_redirect` and the prefix `https://chatgpt.com/connector/oauth/`, and an authorize request naming `https://chatgpt.com/connector/oauth/<callback id>` is accepted

#### Scenario: A client made for Claude

- **WHEN** the owner creates a client with `platform` `anthropic`
- **THEN** an authorize request naming `https://claude.ai/api/mcp/auth_callback` or `https://claude.com/api/mcp/auth_callback` is accepted

#### Scenario: A custom address is exact

- **WHEN** the owner creates a client with `redirect_uris` `["https://assistant.example/oauth/callback"]`
- **THEN** that address is accepted at the authorize step and `https://assistant.example/oauth/callback/x` is refused with 400

#### Scenario: An unsafe custom address is refused

- **WHEN** the owner creates a client with `redirect_uris` `["http://assistant.example/cb"]` or `["https://*.example/cb"]`
- **THEN** the response is 400 `invalid_redirect_uri` and no client is created

### Requirement: Dynamic registration only for known connector platforms

`POST /oauth/register` SHALL implement RFC 7591 only for redirect addresses of the known AI connector platforms, all of one platform: Google's `oauth-redirect`, `oauth-redirect-sandbox` and `oauth-redirect-test` `.googleusercontent.com` under `/r/` and `/a/`; ChatGPT's `https://chatgpt.com/connector_platform_oauth_redirect` and `https://chatgpt.com/connector/oauth/` followed by one segment; Claude's `https://claude.ai/api/mcp/auth_callback` and `https://claude.com/api/mcp/auth_callback`. It SHALL store that platform's redirect addresses, SHALL issue a confidential client with scope `read`, and SHALL refuse every other address, and a mix of platforms, with 400 `invalid_redirect_uri`. Registration SHALL be limited to five a minute per client address, SHALL remove dynamic clients nobody authorized within a day, and SHALL refuse with 503 while 200 dynamic clients remain.

#### Scenario: A foreign redirect is refused

- **WHEN** an anonymous caller registers `https://evil.example/cb`
- **THEN** the response is 400 `invalid_redirect_uri` and no client is created

#### Scenario: A look-alike address is refused

- **WHEN** an anonymous caller registers `https://chatgpt.com.evil.example/connector_platform_oauth_redirect`, `https://claude.ai/api/mcp/auth_callback/x` or `https://chatgpt.com/connector/oauth/a/b`
- **THEN** the response is 400 `invalid_redirect_uri` and no client is created

#### Scenario: Registration is rate limited

- **WHEN** one address registers a sixth client within a minute
- **THEN** the response is 429 `rate_limited` and no client is created

#### Scenario: A Google connector registers

- **WHEN** an anonymous caller registers `https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-123`
- **THEN** the response is 201 with a client id, a secret and scope `read`

#### Scenario: ChatGPT and Claude register

- **WHEN** an anonymous caller registers `https://chatgpt.com/connector/oauth/abc123`, or `https://claude.ai/api/mcp/auth_callback`
- **THEN** the response is 201 with a client id, a secret and scope `read`, and the client can complete the authorization with that address

### Requirement: Authorize validates and redirects

The authorize step and the consent calls SHALL validate the client, the registered `redirect_uri`, `response_type=code` and `code_challenge_method=S256`, answering 400 without a `Location` when the client or address is wrong. A registered address SHALL match only itself, except a known platform's prefix, which SHALL match that prefix followed by exactly one segment that is not empty, `.` or `..` and holds no `/`, `\`, `?`, `#`, `%`, white space or control character. The code's scope SHALL be the client's own: the request neither widens nor narrows it.

#### Scenario: An agent client stays writable

- **WHEN** an `agent` client authorizes with `scope=read` because that is the first scope the metadata lists
- **THEN** the code carries `agent` and the token response reports `agent`

#### Scenario: An unknown redirect is not redirected to

- **WHEN** the `redirect_uri` is not registered for the client
- **THEN** the response is 400 and carries no `Location` header

#### Scenario: A stored address ending in a slash is not a prefix

- **WHEN** a client registered `https://assistant.example/cb/` and the request names `https://assistant.example/cb/other`
- **THEN** the response is 400 and carries no `Location` header
