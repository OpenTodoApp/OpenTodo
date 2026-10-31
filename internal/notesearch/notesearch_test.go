package notesearch

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
	"unicode"
)

// vectors is testdata/vectors.json, shared with web/src/lib/noteSearch.test.ts.
type vectors struct {
	Normalize []struct{ Name, In, Out string } `json:"normalize"`
	Strip     []struct{ Name, In, Out string } `json:"strip"`
	Query     []struct {
		Name string   `json:"name"`
		In   string   `json:"in"`
		Out  []string `json:"out"`
	} `json:"query"`
	Match []struct {
		Name       string `json:"name"`
		Title      string `json:"title"`
		Text       string `json:"text"`
		Query      string `json:"query"`
		Matched    bool   `json:"matched"`
		TitleMatch bool   `json:"title_match"`
		BodyWords  int    `json:"body_words"`
	} `json:"match"`
	Rank []struct {
		Name  string `json:"name"`
		Query string `json:"query"`
		Notes []struct {
			Key     string `json:"key"`
			Title   string `json:"title"`
			Text    string `json:"text"`
			Updated int64  `json:"updated"`
		} `json:"notes"`
		Keys []string `json:"keys"`
	} `json:"rank"`
	Snippet []struct {
		Name     string    `json:"name"`
		Text     string    `json:"text"`
		Query    string    `json:"query"`
		Max      int       `json:"max"`
		Segments []Segment `json:"segments"`
	} `json:"snippet"`
}

func load(t *testing.T) vectors {
	t.Helper()
	raw, err := os.ReadFile("testdata/vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v vectors
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func TestVectors(t *testing.T) {
	v := load(t)
	for _, c := range v.Normalize {
		if got := Normalize(c.In); got != c.Out {
			t.Errorf("normalize %s: %q, want %q", c.Name, got, c.Out)
		}
	}
	for _, c := range v.Strip {
		if got := StripMarkdown(c.In); got != c.Out {
			t.Errorf("strip %s: %q, want %q", c.Name, got, c.Out)
		}
	}
	for _, c := range v.Query {
		if got := ParseQuery(c.In); !reflect.DeepEqual(got, c.Out) {
			t.Errorf("query %s: %q, want %q", c.Name, got, c.Out)
		}
	}
	for _, c := range v.Match {
		want := Result{Matched: c.Matched, TitleMatch: c.TitleMatch, BodyWords: c.BodyWords}
		if got := Match(c.Title, c.Text, ParseQuery(c.Query)); got != want {
			t.Errorf("match %s: %+v, want %+v", c.Name, got, want)
		}
	}
	for _, c := range v.Rank {
		notes := make([]Note, len(c.Notes))
		for i, n := range c.Notes {
			notes[i] = Note{Key: n.Key, Title: n.Title, Text: n.Text, Updated: n.Updated}
		}
		keys := []string{}
		for _, h := range Rank(notes, c.Query) {
			keys = append(keys, h.Note.Key)
		}
		if !reflect.DeepEqual(keys, c.Keys) {
			t.Errorf("rank %s: %q, want %q", c.Name, keys, c.Keys)
		}
	}
	for _, c := range v.Snippet {
		size := c.Max
		if size == 0 {
			size = DefaultSnippet
		}
		want := c.Segments
		if want == nil {
			want = []Segment{}
		}
		if got := Snippet(c.Text, ParseQuery(c.Query), size); !reflect.DeepEqual(got, want) {
			t.Errorf("snippet %s: %+v, want %+v", c.Name, got, want)
		}
	}
}

func TestVectorCounts(t *testing.T) {
	// web/src/lib/noteSearch.test.ts pins the same counts.
	v := load(t)
	got := []int{len(v.Normalize), len(v.Strip), len(v.Query), len(v.Match), len(v.Rank), len(v.Snippet)}
	if want := []int{12, 19, 9, 11, 3, 11}; !reflect.DeepEqual(got, want) {
		t.Errorf("vector counts %v, want %v", got, want)
	}
}

// TestFoldIsFinal checks the table is a full decomposition: no value holds a combining mark or
// a code point the table maps again (the web test checks the values against NFKD).
func TestFoldIsFinal(t *testing.T) {
	for r, d := range fold {
		for _, x := range d {
			if _, again := fold[x]; again || unicode.Is(unicode.M, x) {
				t.Errorf("fold %U: %q holds %U", r, d, x)
			}
		}
	}
}

func TestNormalizeIsIdempotent(t *testing.T) {
	for r := range fold {
		once := Normalize(string(r))
		if twice := Normalize(once); twice != once {
			t.Errorf("%U: %q then %q", r, once, twice)
		}
	}
}
