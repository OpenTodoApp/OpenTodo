package mail

import (
	"slices"
	"strings"
	"testing"
)

// TestListedLanguagesHaveEveryTemplateTranslated: scripts/i18n/new-language.mjs
// writes English copies of the templates whose first line is "# TODO translate"
// (OpenSpec change more-languages, design D5). They are never rendered while the
// language is not in Languages; once it is, every template must exist and be
// translated.
func TestListedLanguagesHaveEveryTemplateTranslated(t *testing.T) {
	for name, text := range templates {
		kind, lang, _ := strings.Cut(name, ".")
		if _, ok := templates[kind+".en"]; !ok {
			t.Errorf("templates/%s.txt has no English source", name)
		}
		if slices.Contains(Languages, lang) && strings.HasPrefix(text, "# TODO translate") {
			t.Errorf("templates/%s.txt is still an untranslated scaffold, but %s is in Languages", name, lang)
		}
	}
	for name := range templates {
		kind, lang, _ := strings.Cut(name, ".")
		if lang != "en" {
			continue
		}
		for _, l := range Languages {
			if _, ok := templates[kind+"."+l]; !ok {
				t.Errorf("%s is in Languages but templates/%s.%s.txt is missing", l, kind, l)
			}
		}
	}
}

// TestUnlistedLanguageRendersEnglish: a language with templates on disk but not
// in Languages (a scaffold, a community language) is sent in English.
func TestUnlistedLanguageRendersEnglish(t *testing.T) {
	m := Message{Kind: KindTest, To: "bob@example.com", Lang: "sv", Origin: "https://todo.example.com"}
	subj, _, err := Render(m, m.Origin)
	if err != nil {
		t.Fatal(err)
	}
	m.Lang = "en"
	want, _, _ := Render(m, m.Origin)
	if subj != want {
		t.Fatalf("subject %q, want the English %q", subj, want)
	}
}
