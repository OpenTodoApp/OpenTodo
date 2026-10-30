# Tasks

## 1. Server

- [ ] 1.1 Migration `NNNN_channel_chat_id` adding `chat_id TEXT NOT NULL DEFAULT ''` to `notification_channels`; verify `go test ./internal/store/...`
- [ ] 1.2 `internal/channels`: kind `telegram`, validation of token, chat id and optional Bot API address (design D1), the token in the secrets file, `chatId` in reads; verify `go test ./internal/channels/ -run Validation` (valid private, group and `@channel` ids; malformed token and chat id; missing token)
- [ ] 1.3 Sender (design D2): `sendMessage` request with HTML-escaped title and message, the button only for public https links, the link as last line otherwise, the button label in the channel's language; `retry_after` honoured by the queue; verify `TestKindsRequestShapes` extended with an `httptest` Bot API (request path, JSON body, escaping, button present and absent) and a queue test for `429 retry_after`
- [ ] 1.4 Token scrubbing (design D3): errors built without the URL; verify a test that a refused connection, a 401 and a 400 leave no token and no `bot<token>` in the outcome, the delivery row, the captured `slog` output and the audit entry
- [ ] 1.5 Content policy and languages for Telegram: generic texts with titles off and on an encrypted account; the button label in every maintained language; verify `TestContentPolicyAndLanguages` extended and `TestEncryptedAccountSendsNoContent` for the Telegram kind

## 2. Routes

- [ ] 2.1 `POST /api/v1/notification-channels/telegram/chats` (design D4) through `routes.handle` with `signedIn.DemoDenied()` inside `channelsGate`, sharing the test limit; error codes `telegram_webhook_set` and `telegram_unreachable` added to `web/src/lib/i18n/server-error-codes.json` with messages; verify `go test ./internal/httpapi/ -run TelegramChats` (unauthenticated 401 with no upstream call, wrong token 400, other account's channel 404, webhook set 409, unreachable 502, rate limit 429, owner switch off 404, a list of private, group and channel chats de-duplicated and capped at 20) and the policy and demo tests (`go test ./internal/httpapi/ -run 'Policy|Demo'`)
- [ ] 2.2 Create and patch accept `kind: "telegram"` and `chatId`; the audit events carry `channel_kind: telegram`; verify `TestChannelLifecycle` extended and `go test ./internal/audit/...`

## 3. Client

- [ ] 3.1 `lib/notificationChannels.ts` types for the kind, `chatId` and the chats route
- [ ] 3.2 Telegram editor in the Delivery channels dialog: token as a password input that says when one is saved, chat id with Find chats and its list, optional Bot API address under "Advanced", the BotFather help, the group warning and confirmation before titles, Find chats disabled offline; verify `notificationChannels.test.tsx` (`npm test`: find and pick a chat, empty list hint, webhook-set message, group confirmation, offline state) and stories in both themes and at 360 px
- [ ] 3.3 Translations in the five catalogs and the kind's icon from the icon catalogue; verify `make i18n-check`, `make ui-lint` and `make ui-check`

## 4. Documentation and release

- [ ] 4.1 `docs/notification-channels.md` Telegram section (create the bot, find the chat, groups, a self-hosted Bot API server, privacy); add a pointer from `docs/webhooks.md#telegram` (whose relay recipe stays, since it serves task events) to the new channel for personal notifications; `docs/api.md` kind, field, validation rules, the new route and its errors; verify `make docs-check`
- [ ] 4.2 Route matrix and demo deny list stay in agreement (`go test ./internal/httpapi/ -run Demo`); the route listed in `docs/api.md`'s channel table
- [ ] 4.3 CHANGELOG entry under Unreleased (Added: Telegram as a notification channel); verify `make docs-check`
- [ ] 4.4 `go test ./...`, `cd web && npm test && npm run build`, `make check` with TZ=UTC
