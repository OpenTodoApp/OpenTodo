package assistant

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/pixari/opentodo/internal/audit"
)

func anthropicOn() Settings {
	s := Defaults()
	s.Enabled = true
	s.Providers[Anthropic] = ProviderSettings{Enabled: true, Model: DefaultAnthropicModel}
	return s
}

func strp(s string) *string { return &s }

// TestAssistantSecretsNeverSerialised: keys live in secrets/assistant.json
// (0600) and never appear in JSON, slog, %v or the audit log.
func TestAssistantSecretsNeverSerialised(t *testing.T) {
	f := newFixture(t)
	dir := t.TempDir()
	st := NewStore(f.sync.DB(), dir, nil)
	rec := audit.New(f.sync.DB(), nil)
	ctx := context.Background()
	const key = "sk-ant-SUPER-SECRET-123"
	if _, err := st.SaveSettings(ctx, "owner", anthropicOn(), KeyChange{Anthropic: strp(key)}, nil, rec); err != nil {
		t.Fatal(err)
	}
	if err := st.SetUserKey(ctx, "u1", Anthropic, "sk-user-OWN-456", rec); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(st.SecretsPath())
	if err != nil || info.Mode().Perm() != 0o600 || !strings.HasSuffix(st.SecretsPath(), "secrets/assistant.json") {
		t.Fatalf("secrets file %v %v", info, err)
	}
	sec, err := st.Secrets()
	if err != nil || sec.Value(OperatorKey(Anthropic)) != key {
		t.Fatalf("%v", err)
	}
	var logs bytes.Buffer
	slog.New(slog.NewJSONHandler(&logs, nil)).Info("x", "secrets", sec)
	js, _ := json.Marshal(sec)
	all := string(js) + logs.String() + fmt.Sprintf("%v %+v %#v %s", sec, sec, sec, sec)
	// The settings row and the audit log.
	var stored string
	_ = f.sync.DB().QueryRow(`SELECT value FROM settings WHERE key = ?`, SettingKey).Scan(&stored)
	all += stored
	rows, _ := f.sync.DB().Query(`SELECT * FROM audit_events`)
	for rows.Next() {
		cols, _ := rows.Columns()
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		_ = rows.Scan(ptrs...)
		all += fmt.Sprint(vals...)
	}
	rows.Close()
	for _, v := range []string{key, "sk-user-OWN-456"} {
		if strings.Contains(all, v) {
			t.Fatalf("a key leaked: %s", all)
		}
	}
	if !strings.Contains(all, "assistant.anthropic.key") || !strings.Contains(all, "assistant.own_key.anthropic") {
		t.Fatalf("key changes not audited: %s", all)
	}
}

func TestKeyAuditSetUnset(t *testing.T) {
	f := newFixture(t)
	st := NewStore(f.sync.DB(), t.TempDir(), nil)
	rec := audit.New(f.sync.DB(), nil)
	ctx := context.Background()
	s := Defaults()
	s.AllowMemberKeys = true
	if _, err := st.SaveSettings(ctx, "owner", s, KeyChange{OpenAI: strp("sk-1")}, nil, rec); err != nil {
		t.Fatal(err)
	}
	if _, err := st.SaveSettings(ctx, "owner", s, KeyChange{OpenAI: strp("")}, nil, rec); err != nil {
		t.Fatal(err)
	}
	rows, err := f.sync.DB().Query(`SELECT details FROM audit_events WHERE name = 'settings.changed' ORDER BY id`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var details []string
	for rows.Next() {
		var d string
		_ = rows.Scan(&d)
		details = append(details, d)
	}
	joined := strings.Join(details, "\n")
	if !strings.Contains(joined, `"from":"unset"`) || !strings.Contains(joined, `"to":"unset"`) || strings.Contains(joined, "sk-1") {
		t.Fatalf("%s", joined)
	}
}

func TestEnableNeedsKey(t *testing.T) {
	st := newTestStore(t)
	var inv *InvalidError
	if _, err := st.SaveSettings(context.Background(), "o", anthropicOn(), nil, nil, nil); err == nil || !asInvalid(err, &inv) || inv.Field != "keys.anthropic" {
		t.Fatalf("%v", err)
	}
	bad := anthropicOn()
	bad.DefaultProvider = "skynet"
	if _, err := st.SaveSettings(context.Background(), "o", bad, nil, nil, nil); !asInvalid(err, &inv) || inv.Field != "default_provider" {
		t.Fatalf("%v", err)
	}
	bad = anthropicOn()
	bad.Providers["skynet"] = ProviderSettings{}
	if _, err := st.SaveSettings(context.Background(), "o", bad, nil, nil, nil); !asInvalid(err, &inv) {
		t.Fatalf("%v", err)
	}
}

func asInvalid(err error, target **InvalidError) bool {
	e, ok := err.(*InvalidError)
	if ok {
		*target = e
	}
	return ok
}

func TestUserKeysAndRemoval(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()
	s := anthropicOn()
	s.AllowMemberKeys = true
	if _, err := st.SaveSettings(ctx, "o", s, KeyChange{Anthropic: strp("operator")}, nil, nil); err != nil {
		t.Fatal(err)
	}
	_ = st.SetUserKey(ctx, "u1", Anthropic, "mine", nil)
	if k, own, _ := st.KeyFor("u1", Anthropic, s); k != "mine" || !own {
		t.Fatal(k)
	}
	if k, _, _ := st.KeyFor("u2", Anthropic, s); k != "operator" {
		t.Fatal(k)
	}
	s.AllowMemberKeys = false
	if k, _, _ := st.KeyFor("u1", Anthropic, s); k != "operator" {
		t.Fatal("a member key was used although the owner no longer allows it")
	}
	if err := st.RemoveUserKeys("u1"); err != nil {
		t.Fatal(err)
	}
	sec, _ := st.Secrets()
	if sec.Has(UserKey("u1", Anthropic)) || !sec.Has(OperatorKey(Anthropic)) {
		t.Fatal("removal")
	}
}

func TestConsentValidity(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()
	c, _ := st.Consent(ctx, "u1")
	if c.Valid(Anthropic) {
		t.Fatal("no consent is valid")
	}
	_ = st.SetConsent(ctx, "u1", Anthropic, true)
	c, _ = st.Consent(ctx, "u1")
	if !c.Valid(Anthropic) || c.Valid(OpenAI) || c.DisclosureVersion != DisclosureVersion {
		t.Fatalf("%+v", c)
	}
	_ = st.SetConsent(ctx, "u1", Anthropic, false)
	if c, _ = st.Consent(ctx, "u1"); c != nil {
		t.Fatal("withdrawn")
	}
}

func TestUsageRecordedPerTurn(t *testing.T) {
	st := newTestStore(t)
	ctx := context.Background()
	_ = st.AddUsage(ctx, "u1", 100, 20)
	_ = st.AddUsage(ctx, "u1", 50, 5)
	u, err := st.Usage(ctx, "u1", 1000)
	if err != nil || u.InputTokens != 150 || u.OutputTokens != 25 || u.Turns != 2 || u.Total() != 175 || u.Cap != 1000 {
		t.Fatalf("%+v %v", u, err)
	}
}

func TestQuotaResetsMonthly(t *testing.T) {
	f := newFixture(t)
	now := time.Date(2026, 10, 31, 23, 59, 0, 0, time.UTC)
	st := NewStore(f.sync.DB(), t.TempDir(), func() time.Time { return now })
	ctx := context.Background()
	_ = st.AddUsage(ctx, "u1", 400, 100)
	u, _ := st.Usage(ctx, "u1", 500)
	if u.Total() != 500 || u.Month != "2026-10" || u.ResetsAt != "2026-11-01" {
		t.Fatalf("%+v", u)
	}
	now = time.Date(2026, 11, 1, 0, 0, 1, 0, time.UTC)
	u, _ = st.Usage(ctx, "u1", 500)
	if u.Total() != 0 || u.Month != "2026-11" || u.ResetsAt != "2026-12-01" {
		t.Fatalf("%+v", u)
	}
	// December rolls over into the next year.
	now = time.Date(2026, 12, 15, 0, 0, 0, 0, time.UTC)
	if u, _ = st.Usage(ctx, "u1", 500); u.ResetsAt != "2027-01-01" {
		t.Fatalf("%+v", u)
	}
}

func TestAcquireLimits(t *testing.T) {
	svc := NewService(nil, nil)
	svc.SetMaxConcurrent(2)
	r1, err := svc.Acquire("a")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Acquire("a"); err != ErrTurnInProgress {
		t.Fatal(err)
	}
	r2, _ := svc.Acquire("b")
	if _, err := svc.Acquire("c"); err != ErrBusy {
		t.Fatal(err)
	}
	r1()
	r1()
	if _, err := svc.Acquire("c"); err != nil {
		t.Fatal(err)
	}
	r2()
}
