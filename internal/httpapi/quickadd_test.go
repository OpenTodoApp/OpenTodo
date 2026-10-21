package httpapi

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/pixari/opentodo/internal/quickadd"
)

// Quick-add parse route (OpenSpec change extension-v2, http-api "Quick-add parse route").

func parseBody(line string, extra ...string) map[string]any {
	b := map[string]any{"line": line, "today": "2026-10-21", "now": "08:00"}
	for i := 0; i+1 < len(extra); i += 2 {
		b[extra[i]] = extra[i+1]
	}
	return b
}

func TestQuickAddParseWithTheAccountsProjects(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/projects", map[string]any{"name": "Home"})
	e.mustStatus(resp, 201, out)
	homeID := out["id"].(string)
	c := e.bearerClient()
	h := append(bearer(e.token("full")), "Accept-Language", "de-DE,de;q=0.9,en;q=0.5")
	resp, out = c.do("POST", parsePath, parseBody("Heizung entlüften morgen 9 Uhr #Home p1 @call"), h...)
	c.mustStatus(resp, 200, out)
	if out["title"] != "Heizung entlüften" {
		t.Fatalf("title = %v", out["title"])
	}
	f := out["fields"].(map[string]any)
	due := f["due"].(map[string]any)
	if due["date"] != "2026-10-22" || due["time"] != "09:00" || f["project_id"] != homeID || f["priority"] != float64(1) {
		t.Fatalf("fields = %v", f)
	}
	labels := f["labels"].([]any)
	if len(labels) != 1 || labels[0].(map[string]any)["name"] != "call" || labels[0].(map[string]any)["id"] != nil {
		t.Fatalf("labels = %v (a label that does not exist has no id)", labels)
	}
	texts := map[string]string{}
	for _, raw := range out["chips"].([]any) {
		ch := raw.(map[string]any)
		texts[ch["kind"].(string)] = ch["text"].(string)
	}
	if !strings.Contains(texts["due"], "Okt") || texts["project"] != "Home" || texts["priority"] != "P1" || texts["label"] != "@call" {
		t.Fatalf("chips = %v (the date in German, the project's name)", texts)
	}
	if out["origin"] != nil {
		t.Fatalf("origin without a url = %v", out["origin"])
	}
}

func TestQuickAddParseExistingLabelHasItsID(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", "/api/v1/labels", map[string]any{"name": "Plumbing"})
	e.mustStatus(resp, 201, out)
	id := out["id"].(string)
	resp, out = e.do("POST", parsePath, parseBody("Fix the tap @plumbing"))
	e.mustStatus(resp, 200, out)
	l := out["fields"].(map[string]any)["labels"].([]any)[0].(map[string]any)
	if l["id"] != id {
		t.Fatalf("label = %v, want id %s (matched ignoring case)", l, id)
	}
}

func TestQuickAddParseRecognisedOrigin(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", parsePath, parseBody("Look at this", "url", "https://github.com/o/r/issues/7"))
	e.mustStatus(resp, 200, out)
	o := out["origin"].(map[string]any)
	if o["kind"] != "issue" || o["provider"] != "github" || o["id"] != "o/r#7" || o["url"] != "https://github.com/o/r/issues/7" {
		t.Fatalf("origin = %v", o)
	}
	resp, out = e.do("POST", parsePath, parseBody("Article", "url", "https://example.org/post"))
	e.mustStatus(resp, 200, out)
	if o := out["origin"].(map[string]any); o["kind"] != "url" || o["url"] != "https://example.org/post" {
		t.Fatalf("plain page origin = %v", o)
	}
}

func TestQuickAddParseReadTokenAcceptedAndWritesNothing(t *testing.T) {
	e := ownerEnv(t)
	secret := e.token("read")
	c := e.bearerClient()
	before := countOps(t, e)
	resp, out := c.do("POST", parsePath, parseBody("Buy milk tomorrow @errand"), bearer(secret)...)
	c.mustStatus(resp, 200, out)
	if after := countOps(t, e); after != before {
		t.Fatalf("ops %d -> %d: the parse route must write nothing", before, after)
	}
	// A read token is still refused on a real write.
	resp, out = c.do("POST", "/api/v1/tasks", map[string]any{"title": "Nope"}, bearer(secret)...)
	c.mustStatus(resp, 403, out)
}

func TestQuickAddParseAnonymous(t *testing.T) {
	e := ownerEnv(t)
	c := e.bearerClient()
	resp, out := c.do("POST", parsePath, parseBody("Buy milk"))
	c.mustStatus(resp, 401, out)
	if code := out["error"].(map[string]any)["code"]; code != "unauthorized" {
		t.Fatalf("code = %v", code)
	}
}

func TestQuickAddParseInvalidInput(t *testing.T) {
	e := ownerEnv(t)
	resp, out := e.do("POST", parsePath, parseBody(strings.Repeat("a", 3000)))
	e.mustStatus(resp, 400, out)
	errObj := out["error"].(map[string]any)
	if errObj["code"] != "invalid_input" || !strings.Contains(errObj["message"].(string), "line") {
		t.Fatalf("error = %v (names line)", errObj)
	}
	code, _ := e.postRaw(parsePath, `["not","an","object"]`)
	if code != 400 {
		t.Fatalf("array body: status %d, want 400", code)
	}
	resp, out = e.do("POST", parsePath, map[string]any{"line": "x", "today": "tomorrow"})
	e.mustStatus(resp, 400, out)
}

func TestQuickAddParseRateLimit(t *testing.T) {
	e := ownerEnv(t)
	for i := 0; i < parsesPerMinute; i++ {
		resp, out := e.do("POST", parsePath, parseBody("Buy milk"))
		e.mustStatus(resp, 200, out)
	}
	resp, out := e.do("POST", parsePath, parseBody("Buy milk"))
	e.mustStatus(resp, 429, out)
	if code := out["error"].(map[string]any)["code"]; code != "rate_limited" {
		t.Fatalf("code = %v", code)
	}
}

// TestQuickAddParseChipsInSixLanguages: the date chip follows the account's
// interface language, and "tomorrow" is read in each language.
func TestQuickAddParseChipsInSixLanguages(t *testing.T) {
	for lang, line := range map[string]string{"en": "Call tomorrow", "de": "Anrufen morgen", "fr": "Appeler demain", "es": "Llamar mañana", "it": "Chiamare domani", "pt": "Ligar amanhã"} {
		a := parseAccountData{lang: lang, labels: map[string]string{}, names: map[string]string{}}
		a.ctx.Languages = quickadd.ActiveLanguages([]string{lang})
		got := parseLine(line, a, "2026-10-21", "08:00")
		due, _ := got.Fields["due"].(map[string]string)
		if due["date"] != "2026-10-22" {
			t.Fatalf("%s: due = %v", lang, got.Fields["due"])
		}
		if len(got.Chips) != 1 || got.Chips[0].Kind != "due" || got.Chips[0].Text == "" {
			t.Fatalf("%s: chips = %+v", lang, got.Chips)
		}
		if lang != "en" && strings.Contains(got.Chips[0].Text, "Thu") {
			t.Fatalf("%s: chip %q is not in %s", lang, got.Chips[0].Text, lang)
		}
	}
}

func TestQuickAddParseUnmatchedProjectAndSpans(t *testing.T) {
	a := parseAccountData{lang: "en", labels: map[string]string{}, names: map[string]string{}}
	a.ctx.Languages = []string{"en"}
	got := parseLine("Pay the bill #Fiance p2", a, "2026-10-21", "08:00")
	if len(got.Unmatched) != 1 || got.Unmatched[0] != "#Fiance" || got.Title != "Pay the bill #Fiance" {
		t.Fatalf("unmatched = %v, title %q", got.Unmatched, got.Title)
	}
	var sawUnmatched bool
	for _, c := range got.Chips {
		if c.Kind == "unmatched" {
			sawUnmatched = c.Start == 13 && c.End == 20 && strings.Contains(c.Text, "#Fiance")
		}
	}
	if !sawUnmatched {
		t.Fatalf("chips = %+v", got.Chips)
	}
	// Spans count UTF-16 code units, like a browser's string.
	got = parseLine("Grüße p1", a, "2026-10-21", "08:00")
	if len(got.Chips) != 1 || got.Chips[0].Start != 6 || got.Chips[0].End != 8 {
		t.Fatalf("utf-16 span = %+v", got.Chips)
	}
}

// TestQuickAddParseSharedVectors pins the route to the web parser: every case of
// web/src/lib/nlp/quickadd.vectors.json goes through the function the handler uses.
func TestQuickAddParseSharedVectors(t *testing.T) {
	raw, err := os.ReadFile("../../web/src/lib/nlp/quickadd.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var file struct {
		Cases []struct {
			Name   string           `json:"name"`
			Line   string           `json:"line"`
			Ctx    quickadd.Context `json:"ctx"`
			Expect struct {
				Title           string              `json:"title"`
				Due             *quickadd.Due       `json:"due"`
				ProjectID       *string             `json:"projectId"`
				Labels          []string            `json:"labels"`
				Priority        *int                `json:"priority"`
				EstimateMinutes *int                `json:"estimateMinutes"`
				SpentMinutes    *int                `json:"spentMinutes"`
				Recurrence      *string             `json:"recurrence"`
				Reminders       []quickadd.Reminder `json:"reminders"`
			} `json:"expect"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatal(err)
	}
	if len(file.Cases) < 20 {
		t.Fatalf("only %d vectors", len(file.Cases))
	}
	for _, c := range file.Cases {
		t.Run(c.Name, func(t *testing.T) {
			a := parseAccountData{ctx: c.Ctx, lang: "en", labels: map[string]string{}, names: map[string]string{}}
			got := parseLine(c.Line, a, c.Ctx.Today, c.Ctx.Now)
			f := got.Fields
			if got.Title != c.Expect.Title {
				t.Fatalf("title %q, want %q", got.Title, c.Expect.Title)
			}
			if c.Expect.Due == nil {
				if f["due"] != nil {
					t.Fatalf("due %v, want none", f["due"])
				}
			} else if d, _ := f["due"].(map[string]string); d["date"] != c.Expect.Due.Date || d["time"] != c.Expect.Due.Time {
				t.Fatalf("due %v, want %+v", f["due"], c.Expect.Due)
			}
			if want := deref(c.Expect.ProjectID); asString(f["project_id"]) != want {
				t.Fatalf("project %v, want %q", f["project_id"], want)
			}
			var names []string
			if ls, ok := f["labels"].([]parseLabel); ok {
				for _, l := range ls {
					names = append(names, l.Name)
				}
			}
			if strings.Join(names, ",") != strings.Join(c.Expect.Labels, ",") {
				t.Fatalf("labels %v, want %v", names, c.Expect.Labels)
			}
			for name, want := range map[string]*int{"priority": c.Expect.Priority, "estimate_minutes": c.Expect.EstimateMinutes, "spent_minutes": c.Expect.SpentMinutes} {
				w := 0
				if want != nil {
					w = *want
				}
				if g, _ := f[name].(int); g != w {
					t.Fatalf("%s %v, want %d", name, f[name], w)
				}
			}
			if want := deref(c.Expect.Recurrence); asString(f["recurrence"]) != want {
				t.Fatalf("recurrence %v, want %q", f["recurrence"], want)
			}
			rs, _ := f["reminders"].([]parseReminder)
			if len(rs) != len(c.Expect.Reminders) {
				t.Fatalf("reminders %v, want %d", rs, len(c.Expect.Reminders))
			}
		})
	}
}

func asString(v any) string {
	s, _ := v.(string)
	return s
}
