## 1. Server

- [x] 1.1 Log one warning per refused same-host page whose host is not the base URL's, capped at 32 hosts (`TestWrongHostIsLoggedOnce`)

## 2. Client

- [x] 2.1 `wrongHostMessage` names the configured host on `bad_origin` when the page is elsewhere; used by sign-in, setup and "Try the demo" (`origin.test.ts`)
- [x] 2.2 Translate the new message (de, es, fr, it, pt)

## 3. Docs

- [x] 3.1 Reverse-proxy and demo pages: update `OPENTODO_BASE_URL` after a domain move; CHANGELOG
