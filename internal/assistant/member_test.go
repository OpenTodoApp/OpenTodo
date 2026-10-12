package assistant

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"testing"

	"github.com/pixari/opentodo/internal/audit"
)

func TestValidateMemberChoice(t *testing.T) {
	for _, c := range []struct {
		provider, model string
		ok              bool
	}{
		{Anthropic, "claude-opus-5-5", true},
		{Anthropic, "claude-haiku-5-5", true},
		{Anthropic, "claude-anything", false},
		{OpenAI, "gpt-4.1-mini", true},
		{OpenAI, "ft:gpt-4o-mini:org:custom_1", true},
		{Gemini, "gemini-2.5-flash", true},
		{Gemini, "models/gemini-2.5-flash", false},
		{OpenAI, "", false},
		{OpenAI, strings.Repeat("a", 100), true},
		{OpenAI, strings.Repeat("a", 101), false},
		{OpenAI, "gpt 4", false},
		{OpenAI, "gpt\n4", false},
		{Compatible, "llama", false},
		{"skynet", "x", false},
	} {
		err := ValidateMemberChoice(c.provider, c.model)
		if (err == nil) != c.ok {
			t.Fatalf("%s %q: %v", c.provider, c.model, err)
		}
	}
	err := ValidateMemberChoice(Compatible, "x")
	if inv, ok := err.(*InvalidError); !ok || inv.Field != "own_provider" || !strings.Contains(inv.Msg, "custom endpoint") {
		t.Fatalf("%v", err)
	}
}

// TestResolveMatrix: member provider only with member keys allowed, a
// choice and its key; otherwise the owner's provider (own legacy key or the
// operator's).
func TestResolveMatrix(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()
	s := anthropicOn()
	s.AllowMemberKeys = true
	if _, err := st.SaveSettings(ctx, "o", s, KeyChange{Anthropic: strp("operator")}, nil, nil); err != nil {
		t.Fatal(err)
	}
	check := func(name string, set Settings, user, provider, model, key string, own, member bool) {
		t.Helper()
		r, err := st.Resolve(ctx, user, set)
		if err != nil {
			t.Fatal(err)
		}
		if r.Provider != provider || r.Model != model || r.key != key || r.Own != own || r.Member != member {
			t.Fatalf("%s: got %s key=%q", name, r, r.key)
		}
	}
	check("no choice", s, "u1", Anthropic, DefaultAnthropicModel, "operator", false, false)
	// A choice without its key falls back to the server's assistant.
	if err := st.SetMemberChoice(ctx, "u1", OpenAI, "gpt-x", nil); err != nil {
		t.Fatal(err)
	}
	check("choice without key", s, "u1", Anthropic, DefaultAnthropicModel, "operator", false, false)
	_ = st.SetUserKey(ctx, "u1", OpenAI, "sk-u1-openai", nil)
	check("choice with key", s, "u1", OpenAI, "gpt-x", "sk-u1-openai", true, true)
	check("another user", s, "u2", Anthropic, DefaultAnthropicModel, "operator", false, false)
	off := s
	off.AllowMemberKeys = false
	check("member keys disallowed", off, "u1", Anthropic, DefaultAnthropicModel, "operator", false, false)
	if c, _ := st.MemberChoice(ctx, "u1"); c == nil || c.Provider != OpenAI {
		t.Fatal("the choice was not kept")
	}
	// Legacy: a key for the owner's provider and no choice.
	_ = st.SetUserKey(ctx, "u2", Anthropic, "sk-u2-own", nil)
	check("legacy own key", s, "u2", Anthropic, DefaultAnthropicModel, "sk-u2-own", true, false)
	check("legacy own key disallowed", off, "u2", Anthropic, DefaultAnthropicModel, "operator", false, false)
	// Clearing the choice.
	_ = st.SetMemberChoice(ctx, "u1", "", "", nil)
	check("cleared", s, "u1", Anthropic, DefaultAnthropicModel, "operator", false, false)
	// A stored compatible choice (never written by the API) is ignored.
	if _, err := st.db.Exec(`INSERT INTO assistant_member_provider(user_id,provider,model,updated_at) VALUES('u1','compatible','llama',1)`); err != nil {
		t.Fatal(err)
	}
	_ = st.SetUserKey(ctx, "u1", Compatible, "k", nil)
	check("compatible ignored", s, "u1", Anthropic, DefaultAnthropicModel, "operator", false, false)
	if n, _ := st.CountMemberKeyUsers(ctx); n != 0 {
		t.Fatalf("count %d", n)
	}
	if err := st.SetMemberChoice(ctx, "u2", Gemini, "gemini-x", nil); err != nil {
		t.Fatal(err)
	}
	_ = st.SetUserKey(ctx, "u2", Gemini, "g", nil)
	if n, _ := st.CountMemberKeyUsers(ctx); n != 1 {
		t.Fatalf("count %d", n)
	}
	if err := st.SetMemberChoice(ctx, "u2", Compatible, "x", nil); err == nil {
		t.Fatal("the store accepted a compatible choice")
	}
}

func TestRouteNeverPrintsKey(t *testing.T) {
	r := Route{Provider: OpenAI, Model: "m", Own: true, Member: true, key: "sk-ROUTE-SECRET"}
	var logs bytes.Buffer
	slog.New(slog.NewJSONHandler(&logs, nil)).Info("x", "route", r)
	slog.New(slog.NewTextHandler(&logs, nil)).Info("x", "route", r)
	js, _ := json.Marshal(r)
	all := logs.String() + string(js) + fmt.Sprintf("%v %+v %#v %s", r, r, r, r)
	if strings.Contains(all, "ROUTE-SECRET") {
		t.Fatalf("the key leaked: %s", all)
	}
}

func TestUsageOwnKeyCounted(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()
	_ = st.AddUsage(ctx, "u1", 100, 20, false)
	_ = st.AddUsage(ctx, "u1", 300, 80, true)
	u, err := st.Usage(ctx, "u1", 1000)
	if err != nil || u.Total() != 500 || u.Turns != 2 || u.Own.Total() != 380 || u.Own.Turns != 1 {
		t.Fatalf("%+v %v", u, err)
	}
	if u.Counted(false) != 120 || u.Counted(true) != 500 {
		t.Fatalf("counted %d %d", u.Counted(false), u.Counted(true))
	}
}

func TestMemberChoiceAudited(t *testing.T) {
	f := newFixture(t)
	st := NewStore(f.sync.DB(), t.TempDir(), nil)
	rec := audit.New(f.sync.DB(), nil)
	ctx := context.Background()
	_ = st.SetMemberChoice(ctx, "u1", OpenAI, "gpt-x", rec)
	_ = st.SetMemberChoice(ctx, "u1", "", "", rec)
	var n int
	_ = f.sync.DB().QueryRow(`SELECT COUNT(*) FROM audit_events WHERE details LIKE '%assistant.own_provider%'`).Scan(&n)
	if n != 2 {
		t.Fatalf("own_provider events %d", n)
	}
}
