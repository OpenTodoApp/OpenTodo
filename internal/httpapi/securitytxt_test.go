package httpapi

import (
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// fieldsOf parses a security.txt body into its fields, in order, skipping comments.
func fieldsOf(t *testing.T, body string) map[string][]string {
	t.Helper()
	out := map[string][]string{}
	for _, line := range strings.Split(strings.TrimRight(body, "\n"), "\n") {
		if strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, ": ")
		if !ok {
			t.Fatalf("not a field: %q", line)
		}
		out[k] = append(out[k], v)
	}
	return out
}

// TestSecurityTxt (external-security-review, "Instances serve security.txt"):
// anyone can read /.well-known/security.txt; it names the project's reporting
// channels, the policy and an Expires date less than a year ahead (RFC 9116), and
// says that problems with the server itself belong to its operator.
func TestSecurityTxt(t *testing.T) {
	e := newEnv(t, false)
	resp, err := http.Get(e.srv.URL + "/.well-known/security.txt")
	if err != nil {
		t.Fatal(err)
	}
	b, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != 200 || resp.Header.Get("Content-Type") != "text/plain; charset=utf-8" {
		t.Fatalf("status %d, type %q", resp.StatusCode, resp.Header.Get("Content-Type"))
	}
	body := string(b)
	if !strings.Contains(body, "# This server runs OpenTodo") || !strings.Contains(body, "contact its operator") {
		t.Fatalf("missing the operator note:\n%s", body)
	}
	f := fieldsOf(t, body)
	if got := f["Contact"]; len(got) != 2 || got[0] != securityAdvisoryURL || got[1] != securityEmail {
		t.Fatalf("Contact = %v", got)
	}
	if got := f["Policy"]; len(got) != 1 || got[0] != securityPolicyURL {
		t.Fatalf("Policy = %v", got)
	}
	if len(f["Expires"]) != 1 {
		t.Fatalf("Expires = %v", f["Expires"])
	}
	exp, err := time.Parse(time.RFC3339, f["Expires"][0])
	if err != nil {
		t.Fatal(err)
	}
	if until := time.Until(exp); until < 90*24*time.Hour || until > 365*24*time.Hour {
		t.Fatalf("Expires %v is %v ahead; RFC 9116 wants it in the future and less than a year", exp, until)
	}
	if _, ok := f["Canonical"]; ok {
		t.Fatalf("Canonical without a base URL: %v", f["Canonical"])
	}
}

// TestSecurityTxtCanonical: with a base URL the file names its canonical address.
func TestSecurityTxtCanonical(t *testing.T) {
	base, _ := url.Parse("https://todo.example.org/app")
	if got := fieldsOf(t, securityTxt(time.Date(2027, 1, 2, 3, 4, 5, 6, time.UTC), base.Scheme+"://"+base.Host+"/.well-known/security.txt")); got["Canonical"][0] != "https://todo.example.org/.well-known/security.txt" || got["Expires"][0] != "2027-07-01T03:04:05Z" {
		t.Fatalf("fields = %v", got)
	}
}

// TestSecurityTxtMatchesSecurityPolicy: the file and SECURITY.md name the same
// channels, so the two cannot drift apart.
func TestSecurityTxtMatchesSecurityPolicy(t *testing.T) {
	b, err := os.ReadFile(filepath.Join("..", "..", "SECURITY.md"))
	if err != nil {
		t.Fatal(err)
	}
	policy := string(b)
	for _, want := range []string{securityAdvisoryURL, strings.TrimPrefix(securityEmail, "mailto:"), "/.well-known/security.txt"} {
		if !strings.Contains(policy, want) {
			t.Errorf("SECURITY.md does not name %s", want)
		}
	}
}
