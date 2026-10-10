package config

import "testing"

func TestOIDCEnvIsOptional(t *testing.T) {
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if c.OIDC.Issuer != "" || c.OIDC.ClientID != "" || c.OIDC.SSOOnly != nil {
		t.Fatalf("OIDC defaults = %+v, want empty", c.OIDC)
	}
	t.Setenv("OPENTODO_OIDC_ISSUER", "https://sso.example.com/realms/home/")
	t.Setenv("OPENTODO_OIDC_CLIENT_ID", "opentodo")
	t.Setenv("OPENTODO_OIDC_SSO_ONLY", "false")
	c, err = Load()
	if err != nil {
		t.Fatal(err)
	}
	if c.OIDC.Issuer != "https://sso.example.com/realms/home" || c.OIDC.ClientID != "opentodo" || c.OIDC.SSOOnly == nil || *c.OIDC.SSOOnly {
		t.Fatalf("OIDC = %+v", c.OIDC)
	}
	t.Setenv("OPENTODO_OIDC_ISSUER", "http://sso.example.com")
	if _, err := Load(); err == nil {
		t.Fatal("http issuer accepted")
	}
	t.Setenv("OPENTODO_OIDC_ISSUER", "")
	t.Setenv("OPENTODO_OIDC_SSO_ONLY", "maybe")
	if _, err := Load(); err == nil {
		t.Fatal("invalid OPENTODO_OIDC_SSO_ONLY accepted")
	}
}
