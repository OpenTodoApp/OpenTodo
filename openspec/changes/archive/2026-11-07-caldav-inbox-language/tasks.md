## 1. Inbox name

- [x] 1.1 `mail.InboxName` gives the digest's Inbox word per shipped language; verified by `internal/mail` `TestInboxNameMatchesWebCatalogs` (equal to `web/src/locales/*.json` "Inbox")
- [x] 1.2 The CalDAV listing names the Inbox from `user_prefs.language`, else `Accept-Language`, else English (`internal/httpapi/davroutes/workspaces.go`); verified by `internal/httpapi` `TestCalDAVInboxNameFollowsLanguage` (German, French, Chinese, an unshipped language, "system", the workspace prefix, project names unchanged, rename refused)
- [x] 1.3 `docs/caldav.md` says so; `make docs-check`, `make openspec-validate`
