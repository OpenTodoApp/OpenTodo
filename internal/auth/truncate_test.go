package auth

import (
	"context"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/OpenTodoApp/opentodo/internal/textutil"
)

// Names stored under a byte limit are cut on a character boundary: a
// multi-byte character at the limit is left out whole, never stored half
// (which JSON then shows as U+FFFD).
func TestTokenNameCutKeepsUTF8(t *testing.T) {
	ctx := context.Background()
	s, _ := newService(t, false)
	owner := mustOwner(t, s)
	name := strings.Repeat("a", 99) + "ë and more" // ë spans bytes 99 and 100
	if _, _, err := s.CreateTokenScoped(ctx, owner.ID, name, ""); err != nil {
		t.Fatal(err)
	}
	list, err := s.ListTokens(ctx, owner.ID)
	if err != nil || len(list) != 1 {
		t.Fatalf("tokens = %v %v", list, err)
	}
	got := list[0].Name
	if !utf8.ValidString(got) || got != strings.Repeat("a", 99) {
		t.Fatalf("name = %q", got)
	}
	cjk := strings.Repeat("日本語", 20) // 180 bytes, cut at 100: 33 characters
	if got := textutil.Truncate(cjk, 100); !utf8.ValidString(got) || got != strings.Repeat("日本語", 11) {
		t.Fatalf("truncate = %q", got)
	}
}
