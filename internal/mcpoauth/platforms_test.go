package mcpoauth

import (
	"errors"
	"strings"
	"testing"
)

// Each platform's documented addresses belong to it and to no other
// (mcp-oauth-connector-redirects D1, D2).
func TestPlatformRedirects(t *testing.T) {
	cases := map[string][]string{
		"google": {
			"https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-1-2",
			"https://oauth-redirect.googleusercontent.com/a/user_bound_custom-mcp-1-2",
			"https://oauth-redirect-sandbox.googleusercontent.com/r/user_bound_custom-mcp-1-2",
			"https://oauth-redirect-test.googleusercontent.com/a/user_bound_custom-mcp-1-2",
		},
		"openai": {
			"https://chatgpt.com/connector_platform_oauth_redirect",
			"https://chatgpt.com/connector/oauth/AbC123_-xyz",
		},
		"anthropic": {
			"https://claude.ai/api/mcp/auth_callback",
			"https://claude.com/api/mcp/auth_callback",
		},
	}
	for id, uris := range cases {
		want, ok := PlatformByID(id)
		if !ok {
			t.Fatalf("platform %q is missing", id)
		}
		for _, u := range uris {
			got, ok := PlatformOf(u)
			if !ok || got.ID != id {
				t.Fatalf("%q: platform = %q, %v; want %q", u, got.ID, ok, id)
			}
			// A client created for the platform accepts the address the app names.
			if !(Client{RedirectURIs: want.Registration()}).AllowsRedirect(u) {
				t.Fatalf("a %s client refused %q", id, u)
			}
		}
	}
	if _, ok := PlatformByID("chat.openai.com"); ok {
		t.Fatal("an unknown platform id was found")
	}
}

// Look-alike hosts, other schemes, other paths, extra segments, queries,
// fragments and escapes are refused by registration and by a platform's
// client alike.
func TestLookAlikeRedirectsAreRefused(t *testing.T) {
	bad := []string{
		"",
		"https://evil.example/cb",
		// Google
		"https://oauth-redirect.googleusercontent.com.evil.example/r/x",
		"http://oauth-redirect.googleusercontent.com/r/x",
		"https://oauth-redirect.googleusercontent.com/r/",
		"https://oauth-redirect.googleusercontent.com/r/x/y",
		"https://oauth-redirect.googleusercontent.com/r/x?y=1",
		"https://oauth-redirect.googleusercontent.com/b/x",
		// ChatGPT
		"https://chatgpt.com.evil.example/connector_platform_oauth_redirect",
		"https://evil.example/chatgpt.com/connector_platform_oauth_redirect",
		"http://chatgpt.com/connector_platform_oauth_redirect",
		"https://chatgpt.com/connector_platform_oauth_redirect/x",
		"https://chatgpt.com/connector_platform_oauth_redirect?next=https://evil.example",
		"https://chatgpt.com/connector_platform_oauth_redirectx",
		"https://chat.openai.com/connector_platform_oauth_redirect",
		"https://chatgpt.com/connector/oauth/",
		"https://chatgpt.com/connector/oauth/a/b",
		"https://chatgpt.com/connector/oauth/..",
		"https://chatgpt.com/connector/oauth/.",
		"https://chatgpt.com/connector/oauth/a%2Fb",
		"https://chatgpt.com/connector/oauth/a#b",
		"https://chatgpt.com/connector/oauth/a\\b",
		"https://chatgpt.com/connector/oauth/a b",
		"https://chatgpt.com/connector/oauthx/a",
		"https://evil.chatgpt.com/connector/oauth/a",
		// Claude
		"https://claude.ai.evil.example/api/mcp/auth_callback",
		"https://claude.ai/api/mcp/auth_callback/x",
		"https://claude.ai/api/mcp/auth_callback?x=1",
		"https://claude.ai/api/mcp/auth_callbackx",
		"https://claude.ai/api/mcp/",
		"http://claude.ai/api/mcp/auth_callback",
		"https://CLAUDE.ai/api/mcp/auth_callback",
		"https://claude.ai:8443/api/mcp/auth_callback",
		"https://evil.claude.ai/api/mcp/auth_callback",
	}
	all := []string{}
	for _, p := range Platforms {
		all = append(all, p.Registration()...)
	}
	every := Client{RedirectURIs: all}
	for _, u := range bad {
		if p, ok := PlatformOf(u); ok {
			t.Fatalf("%q was taken for %s", u, p.ID)
		}
		if every.AllowsRedirect(u) {
			t.Fatalf("%q was allowed", u)
		}
	}
}

func TestAllowsRedirect(t *testing.T) {
	exact := Client{RedirectURIs: []string{"https://app.example/callback"}}
	if !exact.AllowsRedirect("https://app.example/callback") {
		t.Fatal("an exactly registered address was refused")
	}
	if exact.AllowsRedirect("https://app.example/callback/extra") || exact.AllowsRedirect("") || exact.AllowsRedirect(" https://app.example/callback") {
		t.Fatal("a near-miss was accepted")
	}
	// A stored address ending in a slash is not a prefix unless it is a
	// platform's: only the platform table widens a match.
	slash := Client{RedirectURIs: []string{"https://app.example/cb/"}}
	if !slash.AllowsRedirect("https://app.example/cb/") {
		t.Fatal("the exact address with its slash was refused")
	}
	if slash.AllowsRedirect("https://app.example/cb/other") {
		t.Fatal("a custom address ending in a slash matched as a prefix")
	}
	// A platform prefix is never itself a redirect target.
	google := Client{RedirectURIs: GoogleRegistration()}
	if google.AllowsRedirect("https://oauth-redirect.googleusercontent.com/r/") {
		t.Fatal("the bare prefix was allowed")
	}
	// A Google client accepts no ChatGPT address and the reverse.
	openai, _ := PlatformByID("openai")
	if google.AllowsRedirect("https://chatgpt.com/connector/oauth/abc") ||
		(Client{RedirectURIs: openai.Registration()}).AllowsRedirect("https://oauth-redirect.googleusercontent.com/r/x") {
		t.Fatal("a platform's client accepted another platform's address")
	}
}

func TestPlatformRotation(t *testing.T) {
	for _, p := range Platforms {
		got := (Client{RedirectURIs: p.Registration()}).RotatesRefresh()
		if got == p.KeepsRefresh {
			t.Fatalf("%s: rotates = %v", p.ID, got)
		}
	}
	// Only Google keeps its refresh token (mcp-oauth-refresh-rotation D1).
	for _, p := range Platforms {
		if p.KeepsRefresh != (p.ID == "google") {
			t.Fatalf("%s keeps its refresh token = %v", p.ID, p.KeepsRefresh)
		}
	}
}

func TestValidCustomRedirect(t *testing.T) {
	for _, ok := range []string{
		"https://assistant.example/oauth/callback",
		"https://assistant.example:8443/cb?tenant=a",
		"https://assistant.example/cb/",
		"https://chatgpt.com/connector_platform_oauth_redirect",
	} {
		if err := ValidCustomRedirect(ok); err != nil {
			t.Fatalf("%q: %v", ok, err)
		}
	}
	for _, bad := range []string{
		"",
		"http://assistant.example/cb",
		"HTTPS://assistant.example/cb",
		"ftp://assistant.example/cb",
		"https://*.example/cb",
		"https://assistant.example/*",
		"https://assistant.example/cb#frag",
		"https://user:pass@assistant.example/cb",
		"https:///cb",
		"https:assistant.example/cb",
		"/relative/cb",
		"https://assistant.example/c b",
		"https://assistant.example/cb\n",
		"https://assistant.example/" + strings.Repeat("a", 2000),
	} {
		err := ValidCustomRedirect(bad)
		if err == nil {
			t.Fatalf("%q was accepted", bad)
		}
		if !errors.Is(err, ErrCustomRedirect) || err.Error() == "" {
			t.Fatalf("%q: error %v", bad, err)
		}
	}
}
