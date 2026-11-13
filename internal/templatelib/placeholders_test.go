package templatelib

import (
	"encoding/json"
	"os"
	"testing"
)

// note-templates 2.2: the shared placeholder vectors.
func TestPlaceholderVectors(t *testing.T) {
	raw, err := os.ReadFile("testdata/placeholders.vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v struct {
		Fill []struct {
			Name, Title, Text string
			Context           FillContext
			WT                string `json:"want_title"`
			WX                string `json:"want_text"`
		} `json:"fill"`
		Order []struct {
			DateFormat string `json:"date_format"`
			Lang       string `json:"lang"`
			Order      string `json:"order"`
		} `json:"order"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	for _, c := range v.Fill {
		title, text := Fill(c.Title, c.Text, c.Context)
		if title != c.WT || text != c.WX {
			t.Errorf("%s: got %q / %q, want %q / %q", c.Name, title, text, c.WT, c.WX)
		}
	}
	for _, c := range v.Order {
		if got := Order(c.DateFormat, c.Lang); got != c.Order {
			t.Errorf("order %s %s = %s, want %s", c.DateFormat, c.Lang, got, c.Order)
		}
	}
	if u := UnknownPlaceholders("{{destination}} {{date}} {{ date }}"); len(u) != 1 || u[0] != "{{destination}}" {
		t.Fatalf("unknown %v", u)
	}
}

// note-templates 4.2: every built-in note template, in every language, filled
// on a fixed day and time; web/src/lib/noteTemplates.test.ts fills them the
// same way and compares with this file (UPDATE_NOTE_TEMPLATES=1 rewrites it).
func TestBuiltinNoteTemplatesFill(t *testing.T) {
	list, err := Notes()
	if err != nil || len(list) < 5 {
		t.Fatalf("notes %d %v", len(list), err)
	}
	out := map[string]map[string][2]string{}
	for _, n := range list {
		out[n.Slug] = map[string][2]string{}
		for lang := range n.Title {
			c := FillContext{Date: "2026-11-16", Time: "09:30", Order: Order("system", lang), Hour12: Hour12("system", lang), Lang: lang}
			title, body := Fill(n.Title.Pick(lang), n.Body.Pick(lang), c)
			if len(UnknownPlaceholders(title+body)) > 0 || title == "" {
				t.Errorf("%s/%s: %q", n.Slug, lang, title)
			}
			out[n.Slug][lang] = [2]string{title, body}
		}
	}
	b, _ := json.MarshalIndent(out, "", " ")
	const file = "testdata/builtins.filled.json"
	if os.Getenv("UPDATE_NOTE_TEMPLATES") != "" {
		if err := os.WriteFile(file, append(b, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(file)
	if err != nil || string(want) != string(b)+"\n" {
		t.Fatalf("%s is out of date: run UPDATE_NOTE_TEMPLATES=1 go test ./internal/templatelib", file)
	}
	if m, ok := FindNote("meeting"); !ok || m.Title.Pick("de") != "Besprechung {{date}}" {
		t.Fatalf("meeting %v", m)
	}
}
