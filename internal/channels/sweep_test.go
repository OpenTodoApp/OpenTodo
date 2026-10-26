package channels

import (
	"context"
	"os"
	"strings"
	"testing"
)

// The secret sweep fails closed (audit finding G7): when reading the channel
// list stops part way with an error, nothing is deleted, since the channels it
// did not see are live and their tokens must stay.
func TestSweepSecretsFailsClosedOnAPartialRead(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	a := h.create("u1", Input{Kind: ptr(KindGotify), URL: ptr(h.recv.srv.URL), Token: ptr("token-of-a")})
	b := h.create("u2", Input{Kind: ptr(KindGotify), URL: ptr(h.recv.srv.URL), Token: ptr("token-of-b")})
	// The list now fails after a's row and before b's: abs() of the smallest
	// integer is an integer overflow, raised while that row is read.
	for _, q := range []string{
		`ALTER TABLE notification_channels RENAME TO notification_channels_real`,
		`CREATE VIEW notification_channels AS
			SELECT id FROM notification_channels_real WHERE id = '` + a.ID + `'
			UNION ALL SELECT abs(-9223372036854775807 - 1)
			UNION ALL SELECT id FROM notification_channels_real WHERE id = '` + b.ID + `'`,
	} {
		if _, err := h.db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	if n, err := h.svc.SweepSecrets(ctx); err == nil {
		t.Fatalf("sweep on a partial read: %d removed, no error", n)
	}
	raw, err := os.ReadFile(h.svc.SecretsPath())
	if err != nil || !strings.Contains(string(raw), "token-of-a") || !strings.Contains(string(raw), "token-of-b") {
		t.Fatalf("a live channel's token was removed: %v %s", err, raw)
	}
	// With the list readable again, only a channel that is really gone loses
	// its token.
	for _, q := range []string{
		`DROP VIEW notification_channels`,
		`ALTER TABLE notification_channels_real RENAME TO notification_channels`,
		`DELETE FROM notification_channels WHERE id = '` + a.ID + `'`,
	} {
		if _, err := h.db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	if n, err := h.svc.SweepSecrets(ctx); err != nil || n != 1 {
		t.Fatalf("sweep = %d %v", n, err)
	}
	raw, _ = os.ReadFile(h.svc.SecretsPath())
	if strings.Contains(string(raw), "token-of-a") || !strings.Contains(string(raw), "token-of-b") {
		t.Fatalf("secrets after the sweep: %s", raw)
	}
}
