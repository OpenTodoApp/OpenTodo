# OpenTodo push relay protocol, version 1

The relay forwards content-free wake-ups from an OpenTodo server to the iPhone app through Apple's push service (APNs). It stores nothing: what it needs to wake a device is sealed into a handle that only it can open. The design is OpenSpec change `ios-push-relay` (design D3 to D6). `TestProtocolDoc` keeps the tables below equal to the code.

## Routes

HTTPS only. Request bodies are JSON objects of at most 4,096 bytes, and a body with an unknown field, a missing field or trailing data is refused. There are no cookies and no CORS headers. Times are Unix seconds.

| Route | Body | Answer |
| --- | --- | --- |
| `POST /v1/register` | `{"token": hex, "environment": "production" or "development", "wakeKey": base64url of 32 bytes}` | `200 {"handle": string, "expiresAt": seconds}` |
| `POST /v1/wake` | `{"handle": string, "kind": "refresh" or "due", "ts": seconds, "sig": base64url}` | `202` with no body |
| `GET /v1/health` | none | `200 {"protocol": 1}` |

Registration needs no credential and makes no request to Apple. A wake needs the signature below.

## Handles

```
handle    = "h1." base64url(keyId ‖ nonce ‖ sealed)
sealed    = XChaCha20-Poly1305(sealKey[keyId], nonce, plaintext, aad)
aad       = "opentodo-push-relay/handle/1" ‖ keyId
plaintext = environment (1 byte: 1 production, 2 development)
          ‖ issuedAt (8 bytes, big-endian Unix seconds)
          ‖ wakeKey (32 bytes)
          ‖ tokenLength (1 byte) ‖ token (raw bytes)
```

`keyId` is one byte and `nonce` 24 random bytes. The key id is bound into the AAD, so a handle relabelled with another key id does not open. The relay holds up to 4 sealing keys, read from a JSON file `[{"id": 0–255, "key": base64url of 32 bytes}]` with the newest last: new handles use the newest, and all of them open. A handle opens for 30 days after `issuedAt`.

## Signatures

```
sig = base64url(HMAC-SHA256(wakeKey, "opentodo-push-relay/1\n" kind "\n" ts "\n" handle))
```

`ts` is written in decimal. The relay sends the push only when the handle opens, the signature verifies with the wake key sealed in it and `ts` is within 300 seconds of its clock. A replay inside that window sends the same content-free push again, within the limits.

## Payloads

The relay builds every payload from the kind alone. Nothing a caller sends reaches Apple.

| Kind | Headers | Payload |
| --- | --- | --- |
| `refresh` | `apns-push-type: background`, `apns-priority: 5`, `apns-collapse-id: refresh`, expires in 1 hour | `{"aps":{"content-available":1},"v":1}` |
| `due` | `apns-push-type: alert`, `apns-priority: 10`, expires in 10 minutes | `{"aps":{"alert":{"title-loc-key":"PUSH_DUE_TITLE","loc-key":"PUSH_DUE_BODY"},"mutable-content":1,"sound":"default","category":"opentodo.reminder"},"v":1}` |

Both carry `apns-topic: app.open-todo.ios` and a provider token (ES256, signed again every 40 minutes). The interruption level is Apple's default. `v` is the payload version.

## Errors

Every refusal is `{"error": code}`.

| Code | Status | When |
| --- | --- | --- |
| `invalid` | 400 | a malformed body, a missing or unknown field, a token that is not 64 to 200 hex digits, a wake key that is not 32 bytes, a body over 4,096 bytes |
| `signature` | 401 | a handle the relay did not seal, a handle sealed with a key it no longer holds, a wrong signature, a time more than 300 seconds off |
| `expired` | 410 | a handle issued more than 30 days ago: register again |
| `gone` | 410 | Apple says the device token is unregistered or invalid: forget the device |
| `limit` | 429 | a rate limit; `Retry-After` says when to try again |
| `apns` | 502 | Apple could not be reached or failed transiently |
| `not-found` | 404 | no such route |
| `method` | 405 | a route asked with another method |

## Limits

The limits live in memory, in fixed windows aligned to the clock, and reset when the relay restarts. Per-device counters are keyed by an HMAC of the device token under a salt that changes every UTC day, so they follow the phone across registrations and cannot be linked from one day to the next. Address counters and device counters are kept apart: address counters exist for any request and can be pushed out, device counters exist only after a valid signature and never are. While the device counters are full, a device that has none is refused (`429`) until the UTC day ends.

| Limit | Value |
| --- | --- |
| body bytes | 4096 |
| handle lifetime days | 30 |
| signature window seconds | 300 |
| wake key bytes | 32 |
| token hex digits min | 64 |
| token hex digits max | 200 |
| sealing keys | 4 |
| refresh per device per hour | 3 |
| due per device per hour | 4 |
| due per device per day | 24 |
| wakes per address per hour | 3000 |
| registrations per address per hour | 30 |
| wakes per second per instance | 50 |
| rate-limit keys in memory | 200000 |
| IPv6 prefix bits per address | 56 |
| provider token renewal minutes | 40 |

## What the relay keeps

Nothing per request: no address, handle, token, kind or time is logged or stored. Once an hour it writes one line of counters to standard output (registrations, wakes by kind and outcome, refusals by limit, Apple's errors by reason). There is no metrics or debug route.

## Source addresses

The per-address limits count the connection's address. Behind a proxy, `PUSH_RELAY_CLIENT_IP_HEADER` names the header the proxy sets (its last entry counts), and it is believed only from loopback or from `PUSH_RELAY_TRUSTED_PROXIES`, and only when it holds an IP address. Run the relay behind that one proxy and do not publish its port past it.
