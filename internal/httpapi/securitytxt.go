package httpapi

import (
	"net/http"
	"strings"
	"time"
)

// security.txt (RFC 9116; OpenSpec change external-security-review, "Instances
// serve security.txt"): where to report a vulnerability in the software this
// server runs. The contacts are the OpenTodo project's, the same as SECURITY.md;
// a comment says that problems with how this particular server is run belong to
// its operator.
const (
	securityAdvisoryURL = "https://github.com/OpenTodoApp/OpenTodo/security/advisories/new"
	securityEmail       = "mailto:raffaele.pizzari@gmail.com"
	securityPolicyURL   = "https://github.com/OpenTodoApp/OpenTodo/blob/main/SECURITY.md"
	// securityTxtLifetime is how far ahead Expires lies. The file is written
	// for every request, so it never goes stale; RFC 9116 asks for less than a
	// year.
	securityTxtLifetime = 180 * 24 * time.Hour
)

// securityTxt renders the file for the time now; canonical is this server's
// own address of the file, or "" without a base URL.
func securityTxt(now time.Time, canonical string) string {
	var b strings.Builder
	b.WriteString("# This server runs OpenTodo, open-source software. The contacts below reach the\n")
	b.WriteString("# OpenTodo project, for vulnerabilities in the software. For a problem with how\n")
	b.WriteString("# this particular server is run (its domain, accounts or hosting), contact its operator.\n")
	b.WriteString("Contact: " + securityAdvisoryURL + "\n")
	b.WriteString("Contact: " + securityEmail + "\n")
	// Whole seconds in UTC: RFC 9116 takes an RFC 3339 date-time.
	b.WriteString("Expires: " + now.UTC().Add(securityTxtLifetime).Truncate(time.Second).Format(time.RFC3339) + "\n")
	b.WriteString("Policy: " + securityPolicyURL + "\n")
	b.WriteString("Preferred-Languages: en\n")
	if canonical != "" {
		b.WriteString("Canonical: " + canonical + "\n")
	}
	return b.String()
}

func (s *Server) handleSecurityTxt(w http.ResponseWriter, r *http.Request) {
	canonical := ""
	if s.cfg.BaseURL != nil {
		canonical = s.cfg.BaseURL.Scheme + "://" + s.cfg.BaseURL.Host + "/.well-known/security.txt"
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	_, _ = w.Write([]byte(securityTxt(s.now(), canonical)))
}
