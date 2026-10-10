package config

import (
	"strings"
	"testing"
)

func TestWebhooksAllowPrivateIsOptional(t *testing.T) {
	t.Setenv("OPENTODO_WEBHOOKS_ALLOW_PRIVATE", "")
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if c.WebhooksAllowPrivate != nil {
		t.Fatal("unset variable must leave the policy to Settings")
	}

	t.Setenv("OPENTODO_WEBHOOKS_ALLOW_PRIVATE", "true")
	c, err = Load()
	if err != nil || c.WebhooksAllowPrivate == nil || !*c.WebhooksAllowPrivate {
		t.Fatalf("true: %v %v", c.WebhooksAllowPrivate, err)
	}

	t.Setenv("OPENTODO_WEBHOOKS_ALLOW_PRIVATE", "sometimes")
	if _, err = Load(); err == nil || !strings.Contains(err.Error(), "OPENTODO_WEBHOOKS_ALLOW_PRIVATE") {
		t.Fatalf("invalid value: %v", err)
	}
}
