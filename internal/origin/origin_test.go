package origin

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestCheckValue(t *testing.T) {
	t.Parallel()
	long := func(n int) string { return strings.Repeat("é", n) }
	cases := []struct {
		name string
		raw  string
		ok   bool
	}{
		{"null", `null`, true},
		{"ciphertext", `"enc:v1:AAAA"`, true},
		{"plain string", `"https://a.example"`, false},
		{"array", `[]`, false},
		{"number", `1`, false},
		{"page", `{"kind":"url","url":"https://a.example/x","title":"A page"}`, true},
		{"issue", `{"kind":"issue","provider":"github","id":"o/r#7","url":"https://github.com/o/r/issues/7"}`, true},
		{"email without url", `{"kind":"email","id":"<a1@mail.example>"}`, true},
		{"import", `{"kind":"import","provider":"ticktick","id":"6f1a"}`, true},
		{"provider shape", `{"kind":"issue","provider":"My Tracker","id":"1"}`, false},
		{"provider too long", `{"kind":"issue","provider":"` + strings.Repeat("a", 33) + `","id":"1"}`, false},
		{"javascript url", `{"kind":"url","url":"javascript:alert(1)"}`, false},
		{"file url", `{"kind":"url","url":"file:///etc/passwd"}`, false},
		{"url without host", `{"kind":"url","url":"https:///x"}`, false},
		{"unknown kind", `{"kind":"ticket","id":"1"}`, false},
		{"unknown member", `{"kind":"url","url":"https://a.example","favicon":"x"}`, false},
		{"missing kind", `{"id":"1"}`, false},
		{"url kind without url", `{"kind":"url","title":"A page"}`, false},
		{"import without id", `{"kind":"import","provider":"todoist"}`, false},
		{"empty member", `{"kind":"email","id":"1","title":""}`, false},
		{"member not a string", `{"kind":"email","id":7}`, false},
		{"title 500", `{"kind":"email","id":"1","title":"` + long(500) + `"}`, true},
		{"title 600", `{"kind":"email","id":"1","title":"` + long(600) + `"}`, false},
		{"id 512", `{"kind":"email","id":"` + long(512) + `"}`, true},
		{"id 513", `{"kind":"email","id":"` + long(513) + `"}`, false},
		{"url too long", `{"kind":"url","url":"https://a.example/` + strings.Repeat("a", MaxURL) + `"}`, false},
	}
	for _, c := range cases {
		err := CheckValue(json.RawMessage(c.raw))
		if (err == nil) != c.ok {
			t.Errorf("%s: CheckValue err = %v, want ok=%v", c.name, err, c.ok)
		}
	}
}

func TestLabel(t *testing.T) {
	t.Parallel()
	if got := (Origin{Kind: KindURL, URL: "https://WWW.Example.org:8443/post"}).Label(); got != "example.org" {
		t.Errorf("host label = %q", got)
	}
	if got := (Origin{Kind: KindIssue, ID: "o/r#7", URL: "https://github.com/o/r/issues/7"}).Label(); got != "o/r#7" {
		t.Errorf("id label = %q", got)
	}
}

func TestFromURLCutsTitle(t *testing.T) {
	t.Parallel()
	o, err := FromURL("https://example.org", strings.Repeat("x", 600))
	if err != nil || len([]rune(o.Title)) != MaxTitle {
		t.Fatalf("title %d, %v", len(o.Title), err)
	}
}
