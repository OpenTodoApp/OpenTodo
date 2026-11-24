package httpapi

import (
	"crypto/sha256"
	"encoding/base64"
	"html/template"
	"net/http"
	"net/url"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/mail"
	"github.com/OpenTodoApp/opentodo/internal/oidc"
)

// The confirmation of an app sign-in (OpenSpec change app-sso-system-browser,
// design D6). The callback of an app flow does not send the code to the app at
// once: it shows this page in the system browser, naming the account, and the
// code goes to the app only when the person taps Continue. Another app that
// starts its own flow and catches opentodo://sso therefore needs that tap; a
// sign-in nobody started is visible instead of silent.

// appSSOContinuePath is where the page posts Continue or Cancel.
const appSSOContinuePath = "/api/v1/auth/oidc/app-continue"

// appContinueText is the page in the mail texts' languages (mail.LangFrom);
// a language without its own falls back to English, as mail does. The page
// names the server and the account, and not who started the flow: any app
// can start one, so it must not claim to be OpenTodo's. {host} is the
// server's host, {who} the account.
type appContinueWords struct{ Title, Lead, Continue, Cancel string }

var appContinueText = map[string]struct{ Login, Link appContinueWords }{
	"en": {
		Login: appContinueWords{"Sign in on this device", "Sign in to {host} as {who} on this device?", "Sign in", "Cancel"},
		Link:  appContinueWords{"Link a sign-in", "Link {who} to your account on {host}, on this device?", "Link", "Cancel"},
	},
	"de": {
		Login: appContinueWords{"Auf diesem Gerät anmelden", "Auf diesem Gerät als {who} bei {host} anmelden?", "Anmelden", "Abbrechen"},
		Link:  appContinueWords{"Anmeldung verknüpfen", "{who} auf diesem Gerät mit deinem Konto bei {host} verknüpfen?", "Verknüpfen", "Abbrechen"},
	},
}

const appContinueStyle = `body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:48px 24px;color:#1c1c1e;background:#fff}` +
	`main{max-width:360px;margin:0 auto}h1{font-size:20px;margin:0 0 8px}p{margin:0 0 24px;overflow-wrap:anywhere}` +
	`form{display:flex;gap:12px}button{flex:1;min-height:44px;font:inherit;border-radius:10px;border:1px solid #c7c7cc;background:#fff;color:inherit}` +
	`button[value=continue]{background:#0b6e4f;border-color:#0b6e4f;color:#fff}` +
	`@media (prefers-color-scheme:dark){body{background:#1c1c1e;color:#f2f2f7}button{background:#2c2c2e;border-color:#3a3a3c}}`

// appContinueCSP allows nothing but the page's own style and the form's post,
// whose answer redirects to the app's scheme (form-action applies to it).
var appContinueCSP = func() string {
	sum := sha256.Sum256([]byte(appContinueStyle))
	return "default-src 'none'; style-src 'sha256-" + base64.StdEncoding.EncodeToString(sum[:]) + "'; " +
		"form-action 'self' opentodo:; frame-ancestors 'none'; base-uri 'none'"
}()

// The style is part of the template's own text, not data: html/template
// trusts its source and escapes only what is executed into it.
var appContinuePage = template.Must(template.New("continue").Parse(`<!doctype html>
<html lang="{{.Lang}}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>{{.Title}}</title><style>` + appContinueStyle + `</style></head>
<body><main><h1>{{.Title}}</h1><p>{{.Lead}}</p>
<form method="post" action="{{.Action}}"><input type="hidden" name="ticket" value="{{.Ticket}}">
<button type="submit" name="action" value="cancel">{{.Cancel}}</button>
<button type="submit" name="action" value="continue" autofocus>{{.Continue}}</button></form></main></body></html>
`))

// showAppContinue answers the callback of an app flow with the confirmation
// page, for a sign-in or, with link, for linking the identity.
func (s *Server) showAppContinue(w http.ResponseWriter, r *http.Request, ticket string, claims *oidc.Claims, link bool) {
	lang := mail.LangFrom(r.Header.Get("Accept-Language"))
	texts, ok := appContinueText[lang]
	if !ok {
		lang, texts = "en", appContinueText["en"]
	}
	text := texts.Login
	if link {
		text = texts.Link
	}
	host := s.publicOrigin(r)
	if u, err := url.Parse(host); err == nil && u.Host != "" {
		host = u.Host
	}
	// The provider's verified email, else the name it gives: an address it has
	// not verified could be anyone's, so it never names the account.
	who := ""
	if claims.EmailVerified.Value {
		who = strings.TrimSpace(claims.Email)
	}
	if who == "" {
		who = strings.TrimSpace(identityOf(claims, oidc.Config{}).Name)
	}
	if who == "" {
		who = claims.Subject
	}
	h := w.Header()
	h.Set("Content-Type", "text/html; charset=utf-8")
	h.Set("Content-Security-Policy", appContinueCSP)
	h.Set("Cache-Control", "no-store")
	h.Set("Referrer-Policy", "no-referrer")
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("X-Frame-Options", "DENY")
	err := appContinuePage.Execute(w, map[string]any{
		"Lang": lang, "Title": text.Title, "Lead": strings.NewReplacer("{host}", host, "{who}", who).Replace(text.Lead),
		"Continue": text.Continue, "Cancel": text.Cancel, "Ticket": ticket, "Action": appSSOContinuePath,
	})
	if err != nil {
		s.log.Warn("app sign-in page", "err", err)
	}
}

// handleOIDCAppContinue is the page's answer. Continue releases the code and
// sends it to the app with the app's state; Cancel drops the hand-off and
// returns to the app with its state alone, which the app takes as nothing
// happened. The ticket is single use and only on that page.
func (s *Server) handleOIDCAppContinue(w http.ResponseWriter, r *http.Request) {
	if !s.oidcLimiter.allow(clientIP(r)) {
		writeError(w, http.StatusTooManyRequests, "rate_limited", "too many attempts, try again later")
		return
	}
	// A browser sends Origin with a form post: the page's own post passes,
	// another site's is refused. The ticket is the real guard.
	if !s.cookieWriteAllowed(r) {
		writeError(w, http.StatusForbidden, "bad_origin", "cross-site request rejected")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4<<10)
	if err := r.ParseForm(); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "a form with a ticket is required")
		return
	}
	ticket := r.PostForm.Get("ticket")
	if r.PostForm.Get("action") == "cancel" {
		if h, ok := s.oidc.Handoffs().Drop(ticket); ok {
			redirectTo(w, r, appSSORedirect, url.Values{"state": {h.AppState}})
			return
		}
		s.oidcFail(w, r, "/", "oidc_state_invalid")
		return
	}
	code, h, ok := s.oidc.Handoffs().Release(ticket)
	if !ok {
		s.oidcFail(w, r, "/", "oidc_state_invalid")
		return
	}
	redirectTo(w, r, appSSORedirect, url.Values{"code": {code}, "state": {h.AppState}})
}
