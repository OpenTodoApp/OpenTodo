package syncscope

import (
	"errors"
	"strings"
	"testing"
)

func TestIncludes(t *testing.T) {
	work := Place{Workspace: "w2", Projects: []string{"site"}}
	sub := Place{Workspace: "w2", Projects: []string{"blog", "site"}}
	workInbox := Place{Workspace: "w2"}
	home := Place{Workspace: "w1", Projects: []string{"garden"}}
	homeInbox := Place{Workspace: "w1"}
	cases := []struct {
		name  string
		s     Scope
		place Place
		want  bool
	}{
		{"all", Everything(), home, true},
		{"workspace covers its project", Scope{Mode: Only, Workspaces: []string{"w2"}}, work, true},
		{"workspace covers its Inbox", Scope{Mode: Only, Workspaces: []string{"w2"}}, workInbox, true},
		{"other workspace left out", Scope{Mode: Only, Workspaces: []string{"w2"}}, home, false},
		{"project covers sub-project", Scope{Mode: Only, Projects: []string{"site"}}, sub, true},
		{"project leaves the Inbox out", Scope{Mode: Only, Projects: []string{"site"}}, workInbox, false},
		{"Inbox chosen", Scope{Mode: Only, Inboxes: []string{"w1"}}, homeInbox, true},
		{"Inbox does not cover projects", Scope{Mode: Only, Inboxes: []string{"w1"}}, home, false},
		{"except a project", Scope{Mode: Except, Projects: []string{"garden"}}, home, false},
		{"except a project keeps the rest", Scope{Mode: Except, Projects: []string{"garden"}}, homeInbox, true},
		{"except a workspace", Scope{Mode: Except, Workspaces: []string{"w2"}}, sub, false},
	}
	for _, c := range cases {
		if got := c.s.Includes(c.place); got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}

func TestNormalizeAndParse(t *testing.T) {
	s, err := Normalize(Scope{Mode: Only, Projects: []string{" a ", "a", "b"}})
	if err != nil || s.Mode != Only || len(s.Projects) != 2 || s.Workspaces == nil {
		t.Fatalf("normalize: %+v %v", s, err)
	}
	if got := Parse(s.Text()); got.Mode != Only || len(got.Projects) != 2 {
		t.Fatalf("round trip: %+v", got)
	}
	if s, _ := Normalize(Scope{Mode: Only}); !s.IsAll() || s.Text() != "" {
		t.Fatalf("nothing chosen is everything: %+v", s)
	}
	if s, _ := Normalize(Scope{Mode: All, Projects: []string{"a"}}); !s.IsAll() || len(s.Projects) != 0 {
		t.Fatalf("all drops the lists: %+v", s)
	}
	for _, bad := range []Scope{{Mode: "some"}, {Mode: Only, Projects: []string{""}}, {Mode: Only, Projects: []string{strings.Repeat("x", 65)}}} {
		if _, err := Normalize(bad); !errors.Is(err, ErrInvalid) {
			t.Errorf("%+v accepted", bad)
		}
	}
	many := Scope{Mode: Only}
	for i := 0; i <= MaxItems; i++ {
		many.Projects = append(many.Projects, strings.Repeat("p", 1+i%60)+string(rune('a'+i%26))+string(rune('a'+i/26)))
	}
	if _, err := Normalize(many); !errors.Is(err, ErrInvalid) {
		t.Error("too many items accepted")
	}
	for _, raw := range []string{"", "{", `{"mode":"nope"}`} {
		if !Parse(raw).IsAll() {
			t.Errorf("%q is not everything", raw)
		}
	}
}
