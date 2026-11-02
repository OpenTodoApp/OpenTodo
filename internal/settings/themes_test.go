package settings

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/OpenTodoApp/opentodo/internal/store"
)

func themeDoc(kind, name string) []byte {
	return []byte(`{"opentodoTheme":1,"id":"x","name":"` + name + `","author":"Owner","licence":"MIT","kind":"` + kind + `","seeds":{"canvas":"#202020","surface":"#2a2a2a","text":"#eeeeee","accent":"#4c8bf5"}}`)
}

func newThemeStore(t *testing.T) *Store {
	t.Helper()
	db, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return New(db)
}

func TestInstanceThemes(t *testing.T) {
	s := newThemeStore(t)
	ctx := context.Background()
	empty, err := s.Themes(ctx)
	if err != nil || empty.Version != 0 || len(empty.Themes) != 0 || empty.Default != (ThemeDefault{}) {
		t.Fatalf("empty: %+v %v", empty, err)
	}
	got, id, err := s.PutInstanceTheme(ctx, "new", themeDoc("dark", "House"))
	if err != nil {
		t.Fatal(err)
	}
	if got.Version != 1 || len(got.Themes) != 1 || got.Themes[0].ID != id || got.Themes[0].Kind != "dark" {
		t.Fatalf("added: %+v", got)
	}
	var doc map[string]any
	_ = json.Unmarshal(got.Themes[0].Doc, &doc)
	if doc["id"] != id || doc["name"] != "House" {
		t.Fatalf("the document keeps its content and gets the server id: %v", doc)
	}

	// Kind checks of the default.
	for _, d := range []ThemeDefault{{Light: "builtin:nord"}, {Light: "instance:" + id}, {Dark: "builtin:nope"}, {Dark: "user:x"}, {Dark: "instance:missing"}} {
		if _, err := s.SetThemeDefault(ctx, d); !errors.Is(err, ErrThemeInvalid) {
			t.Errorf("%+v: %v, want invalid", d, err)
		}
	}
	got, err = s.SetThemeDefault(ctx, ThemeDefault{Light: "builtin:opentodo-light", Dark: "instance:" + id})
	if err != nil || got.Default != (ThemeDefault{Dark: "instance:" + id}) || got.Version != 2 {
		t.Fatalf("default: %+v %v", got, err)
	}

	// Replacing keeps the id; a default may not change kind.
	if _, _, err := s.PutInstanceTheme(ctx, id, themeDoc("light", "House")); !errors.Is(err, ErrThemeInvalid) {
		t.Fatalf("kind change of a default: %v", err)
	}
	if got, _, err = s.PutInstanceTheme(ctx, id, themeDoc("dark", "House 2")); err != nil || len(got.Themes) != 1 || !strings.Contains(string(got.Themes[0].Doc), "House 2") {
		t.Fatalf("replace: %+v %v", got, err)
	}
	if _, _, err := s.PutInstanceTheme(ctx, "abc", themeDoc("dark", "x")); !errors.Is(err, ErrThemeNotFound) {
		t.Fatalf("replace unknown: %v", err)
	}

	// Invalid and too large documents.
	if _, _, err := s.PutInstanceTheme(ctx, "new", []byte(`{"opentodoTheme":1,"kind":"dark"}`)); !errors.Is(err, ErrThemeInvalid) {
		t.Fatalf("invalid: %v", err)
	}
	big := themeDoc("dark", strings.Repeat("x", 17*1024))
	if _, _, err := s.PutInstanceTheme(ctx, "new", big); !errors.Is(err, ErrThemeTooLarge) {
		t.Fatalf("too large: %v", err)
	}

	// The limit.
	for range MaxInstanceThemes - 1 {
		if _, _, err := s.PutInstanceTheme(ctx, "new", themeDoc("light", "More")); err != nil {
			t.Fatal(err)
		}
	}
	if _, _, err := s.PutInstanceTheme(ctx, "new", themeDoc("light", "One too many")); !errors.Is(err, ErrThemeLimit) {
		t.Fatalf("limit: %v", err)
	}

	// Removing the default clears it in the same change.
	got, err = s.RemoveInstanceTheme(ctx, id)
	if err != nil || got.Default.Dark != "" || len(got.Themes) != MaxInstanceThemes-1 {
		t.Fatalf("remove: %+v %v", got.Default, err)
	}
	if _, err := s.RemoveInstanceTheme(ctx, id); !errors.Is(err, ErrThemeNotFound) {
		t.Fatalf("remove twice: %v", err)
	}
	again, _ := s.Themes(ctx)
	if again.Version != got.Version || again.Default.Dark != "" {
		t.Fatalf("stored: %+v", again)
	}
}
