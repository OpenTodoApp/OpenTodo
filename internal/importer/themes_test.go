package importer

import (
	"context"
	"strings"
	"testing"
)

// theme-editor 1.4 (themes "Custom themes are synced per user", Another
// account): an own export's custom themes come back with their ids, so the
// choices in user_prefs that name them still apply; an invalid document is refused.
func TestThemesRoundTrip(t *testing.T) {
	h := newHarness(t)
	doc := `{"opentodoTheme":1,"id":"th1","name":"Night owl","author":"Ana","licence":"MIT","kind":"dark","seeds":{"canvas":"#1e2127","surface":"#282c34","text":"#e6e6e6","accent":"#61afef"}}`
	bad := strings.Replace(doc, `"#1e2127"`, `"url(x)"`, 1)
	file := `{"format":"opentodo-export","version":1,"userId":"exporter",
		"themes":[{"id":"th1","doc":` + doc + `,"position":1,"created_at":1,"deleted_at":null},
			{"id":"th2","doc":` + bad + `,"position":2,"created_at":1,"deleted_at":null}],
		"user_prefs":[{"id":"me","theme_dark":"user:th1"}]}`
	job := h.run(file, Options{})
	if job.Status != StatusDone {
		t.Fatalf("job = %+v", job)
	}
	ctx := context.Background()
	th, err := h.sync.Get(ctx, h.uid, "theme", "th1")
	if err != nil || th == nil || !strings.Contains(string(th["doc"]), "Night owl") {
		t.Fatalf("theme = %v, %v", th, err)
	}
	if bad, _ := h.sync.Get(ctx, h.uid, "theme", "th2"); bad != nil {
		t.Fatalf("invalid theme imported: %v", bad)
	}
	prefs, _ := h.sync.Get(ctx, h.uid, "user_prefs", "me")
	if str(prefs, "theme_dark") != "user:th1" {
		t.Fatalf("prefs = %v", prefs)
	}
}
