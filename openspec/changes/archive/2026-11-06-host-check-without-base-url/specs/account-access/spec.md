## MODIFIED Requirements

### Requirement: First-run owner setup
A server with no accounts SHALL let the first visitor create an account, and that account SHALL receive the owner role. The setup state SHALL be discoverable without authentication so the client can show the setup screen. When the operator configured a setup token, creating the first account SHALL require that token from every address; the token SHALL have no effect once an owner exists. The one-time setup code SHALL be off by default and turned on only by the optional `OPENTODO_SETUP_CODE=required`; unset, empty or `off` leaves it off, and any other value SHALL stop startup with a message naming the variable. With the code off and no token, the first registration SHALL need nothing more, and while no account exists the server SHALL log one warning at startup saying that the first person to open the server becomes its owner and naming `OPENTODO_SETUP_CODE=required`. With the code on and no setup token, a first registration over a loopback connection that carries no forwarding header (`X-Forwarded-For`, `Forwarded`, `X-Real-IP`, `CF-Connecting-IP`, `True-Client-IP`) SHALL need nothing more; any other registration, including one from a private address or through a proxy, SHALL require the setup code, because behind a NAT, a port forwarder or a rootless container every client can arrive from a private address. A configured setup token SHALL always be required instead of the code. A tenant served by a host SHALL always have the code on behind its setup token. While no `OPENTODO_BASE_URL` is set, a first registration addressed to an unverified host SHALL also require the setup code, whatever `OPENTODO_SETUP_CODE` says and also over a loopback connection, unless a setup token is configured, which it then requires instead. The host is the request's `Host`, or `X-Forwarded-Host` from a trusted proxy; it is verified when it is an IP address, a name without a dot, or a name ending in `.localhost`, `.local`, `.lan`, `.home`, `.home.arpa`, `.internal`, `.corp` or `.test`, and unverified otherwise, because a page under any other name may belong to whoever controls that name and points it at the server (DNS rebinding). Refused for this reason, the error SHALL be 403 `setup_code_invalid` with a message naming the setup code in the server log and `OPENTODO_BASE_URL`, and the authentication status SHALL report `setupCodeForHost` so the setup screen can say why the code is asked for and offer the IP address or `OPENTODO_BASE_URL` instead. The server SHALL generate the code at startup only while no account exists, no token is configured, and either the code is on or no `OPENTODO_BASE_URL` is set (80 random bits, shown as four groups of four base32 characters), print it once in its log at warning level with a sentence saying what it is for (with the code off, inside the warning about the first visitor, saying it is asked for under a domain name until `OPENTODO_BASE_URL` is set), accept it in the setup-token field ignoring case, spaces and dashes, compare it in constant time, count attempts against the registration rate limit, keep it only in memory and discard it once the owner exists. The authentication status SHALL say when the requesting client needs the setup code. Setup creates no ops, so offline behaviour and convergence are unaffected.

#### Scenario: Fresh server reports setup required
- **WHEN** a client asks for the authentication status of a server with zero accounts
- **THEN** the response states that setup is required and that sign-up is currently allowed

#### Scenario: First account becomes owner
- **WHEN** the first account is created with a valid email and password
- **THEN** the account has the role `owner`, a session is started for it, and the server no longer reports setup required

#### Scenario: Setup token required
- **WHEN** `OPENTODO_SETUP_TOKEN` is set and a client asks for the authentication status of a server with zero accounts
- **THEN** the response states that setup is required and that a setup token is required

#### Scenario: Wrong or missing setup token
- **WHEN** `OPENTODO_SETUP_TOKEN` is set, no account exists, and someone registers without the token or with a different one
- **THEN** the request is refused with a `setup_token_invalid` error, no account is created, and the attempt counts against the registration rate limit

#### Scenario: Correct setup token
- **WHEN** `OPENTODO_SETUP_TOKEN` is set, no account exists, and someone registers with a valid email, password and the configured token
- **THEN** the account has the role `owner` and a session is started for it

#### Scenario: Token ignored after setup
- **WHEN** an owner exists and someone registers with or without the setup token
- **THEN** the sign-up policy and invitations decide, exactly as without a token

#### Scenario: Setup code printed at startup
- **WHEN** the server starts with `OPENTODO_SETUP_CODE=required`, no account and no setup token
- **THEN** its log has one warning line with the setup code and how to use it, and no code is generated when a token is configured or an owner exists

#### Scenario: Code off by default
- **WHEN** the server starts without `OPENTODO_SETUP_CODE`, no account and no setup token, and a client on a public address registers without a code through an IP address or a local name
- **THEN** the log has one warning that the first visitor becomes the owner, the status says no setup code is required, and the account becomes the owner

#### Scenario: Domain name without a base URL
- **WHEN** no `OPENTODO_BASE_URL`, no setup token and no account exist, and a browser registers the first account with `Host: rebind.example` and `Origin: http://rebind.example`, without the code
- **THEN** the status says a setup code is required and that the host is the reason, the registration is refused with 403 `setup_code_invalid` naming `OPENTODO_BASE_URL`, and no account is created; with the code printed in the warning at startup, the same registration creates the owner

#### Scenario: Local names need no code
- **WHEN** no `OPENTODO_BASE_URL`, no setup token and no account exist, the code is off, and the first registration is addressed to `192.168.1.20:8080`, `localhost`, `nas:8080` or `nas.local:8080`
- **THEN** it needs no code and the account becomes the owner

#### Scenario: Rebound name over loopback
- **WHEN** `OPENTODO_SETUP_CODE=required`, no `OPENTODO_BASE_URL`, no setup token and no account exist, and a registration over a direct loopback connection is addressed to `rebind.example`
- **THEN** it needs the setup code like one from another machine

#### Scenario: Base URL set
- **WHEN** `OPENTODO_BASE_URL` is set and the code is off
- **THEN** no code is generated, and the base URL's host check in cross-site request protection decides which names may register

#### Scenario: Invalid setting
- **WHEN** the server starts with `OPENTODO_SETUP_CODE=yes`
- **THEN** it exits with a message naming `OPENTODO_SETUP_CODE` and its accepted values

#### Scenario: Token wins over the code
- **WHEN** `OPENTODO_SETUP_CODE=required` and `OPENTODO_SETUP_TOKEN` are both set and no account exists
- **THEN** no code is printed, the status asks for the token, and only the token admits the first registration

#### Scenario: Setup from a public address
- **WHEN** `OPENTODO_SETUP_CODE=required`, no account exists, no setup token is set, and a client with a public address asks for the authentication status or registers without the code or with a wrong one
- **THEN** the status says a setup code is required, and the registration is refused with 403 `setup_code_invalid` and creates no account

#### Scenario: Setup from the local network
- **WHEN** `OPENTODO_SETUP_CODE=required`, no account exists, no setup token is set, and a client with a private address, or any client through a proxy (a forwarding header), registers without a code
- **THEN** the status says a setup code is required, and the registration is refused with 403 `setup_code_invalid` and creates no account, as from a public address

#### Scenario: Setup from this machine
- **WHEN** `OPENTODO_SETUP_CODE=required`, no account exists, no setup token is set, and a client connected over loopback without a forwarding header registers without a code
- **THEN** the account becomes the owner, and the status for that client says no setup code is required

#### Scenario: Correct setup code
- **WHEN** a client from another machine registers the first account with the code from the log, in any case and with or without its dashes
- **THEN** the account becomes the owner and the code no longer exists
