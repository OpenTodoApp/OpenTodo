package importer

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// FetchTodoist asks the sync endpoint once with the token and the resources the
// import reads; a refused token, a failure and an answer over the limit are
// told apart, and the answer imports through json-items (todoist-api-import).
func TestFetchTodoist(t *testing.T) {
	answer := `{"sync_token":"x","projects":[{"id":"p1","name":"Work","child_order":1}],"sections":[],"labels":[{"id":"l1","name":"call"}],
		"items":[{"id":"i1","content":"Write report","project_id":"p1","priority":4,"labels":["call"],"due":{"date":"2026-11-16","string":"every Monday","is_recurring":true}}],
		"notes":[{"id":"n1","item_id":"i1","content":"Draft by Friday"}]}`
	var got *http.Request
	var form string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r
		b, _ := io.ReadAll(r.Body)
		form = string(b)
		if r.Header.Get("Authorization") != "Bearer good" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		_, _ = w.Write([]byte(answer))
	}))
	defer srv.Close()
	old := TodoistAPIBase
	TodoistAPIBase = srv.URL
	defer func() { TodoistAPIBase = old }()
	ctx := context.Background()

	body, err := FetchTodoist(ctx, srv.Client(), " good ", 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	if got.URL.Path != "/api/v1/sync" || got.Method != http.MethodPost || !strings.Contains(form, "sync_token=%2A") || !strings.Contains(form, "items") || !strings.Contains(form, "notes") {
		t.Fatalf("request %s %s %s", got.Method, got.URL.Path, form)
	}
	p, err := (itemsProfile{}).Read(bytes.NewReader(body), Options{TimeZone: "UTC"})
	if err != nil {
		t.Fatal(err)
	}
	task := rowBySource(t, p, "item:i1")
	if task.Priority != 1 || task.Recurrence != "every monday" || task.Description != "**Comments**\n\nDraft by Friday" {
		t.Fatalf("task = %+v", task)
	}
	if _, err := FetchTodoist(ctx, srv.Client(), "bad", 1<<20); !errors.Is(err, ErrTodoistToken) {
		t.Fatalf("bad token = %v", err)
	}
	if _, err := FetchTodoist(ctx, srv.Client(), "", 1<<20); !errors.Is(err, ErrTodoistToken) {
		t.Fatalf("empty token = %v", err)
	}
	if _, err := FetchTodoist(ctx, srv.Client(), "good", 100); !errors.Is(err, ErrTodoistTooLarge) {
		t.Fatalf("over the limit = %v", err)
	}
}
