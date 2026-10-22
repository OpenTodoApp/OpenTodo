package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// The accessibility statement documents the session lifetime from the default here
// (OpenSpec accessibility "No time limits", accessibility-aaa task 7.3).
func TestAccessibilityStatementNamesTheSessionLifetime(t *testing.T) {
	t.Parallel()
	doc, err := os.ReadFile(filepath.Join("..", "..", "docs", "accessibility.md"))
	if err != nil {
		t.Fatalf("read docs/accessibility.md: %v", err)
	}
	days := int(DefaultSessionTTL / (24 * time.Hour))
	want := fmt.Sprintf("lasts %d days from sign-in", days)
	if !strings.Contains(string(doc), want) {
		t.Fatalf("docs/accessibility.md does not say %q (DefaultSessionTTL is %v)", want, DefaultSessionTTL)
	}
	if !strings.Contains(string(doc), "not ended for inactivity") {
		t.Fatalf("docs/accessibility.md must say the session is not ended for inactivity")
	}
}
