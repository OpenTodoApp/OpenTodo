package importer

import (
	"archive/zip"
	"bytes"
	"errors"
	"strings"
	"testing"
)

// Shape limits (OpenSpec change `importer-field-limits`): a file inside the
// size limit is still refused when one CSV record or the JSON nesting is over
// a limit, with a LimitError naming the limit.

func wantLimit(t *testing.T, name string, err error, contains string) {
	t.Helper()
	var le *LimitError
	if !errors.As(err, &le) {
		t.Fatalf("%s: err = %v (%T), want *LimitError", name, err, err)
	}
	if !strings.Contains(le.Error(), contains) {
		t.Fatalf("%s: message %q does not mention %q", name, le.Error(), contains)
	}
}

func TestCSVFieldOverLimitRefused(t *testing.T) {
	big := strings.Repeat("x", MaxCSVFieldBytes+1)
	data := "title,description\nok,fine\nbig,\"" + big + "\"\n"
	_, err := Parse([]byte(data), Options{Format: "csv"})
	wantLimit(t, "field", err, "line 3")

	// At the limit is fine.
	data = "title,description\nbig,\"" + strings.Repeat("x", MaxCSVFieldBytes) + "\"\n"
	if _, err := Parse([]byte(data), Options{Format: "csv"}); err != nil {
		t.Fatalf("field at the limit: %v", err)
	}
}

func TestCSVRecordOverLimitRefused(t *testing.T) {
	field := strings.Repeat("y", MaxCSVFieldBytes)
	var b strings.Builder
	b.WriteString("title,a,b,c,d,e\nrow")
	for i := 0; i < 5; i++ {
		b.WriteString("," + field)
	}
	b.WriteString("\n")
	_, err := Parse([]byte(b.String()), Options{Format: "csv"})
	wantLimit(t, "record", err, "a CSV record may hold at most")
}

func TestCSVTooManyFieldsRefused(t *testing.T) {
	data := "title" + strings.Repeat(",x", MaxCSVFields) + "\nrow\n"
	_, err := Parse([]byte(data), Options{Format: "csv"})
	wantLimit(t, "fields", err, "fields")
}

// Every CSV profile reads through the limited reader, also for its header.
func TestEveryCSVProfileChecksFields(t *testing.T) {
	big := strings.Repeat("z", MaxCSVFieldBytes+1)
	headers := map[string]string{
		"csv":       "title,description",
		"todoist-csv":   "TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE",
		"ticktick-csv":  "Folder Name,List Name,Title,Kind,Tags,Content",
		"asana-csv":     "Task ID,Created At,Completed At,Last Modified,Name,Section/Column,Assignee,Notes,Projects",
		"linear-csv":    "ID,Team,Title,Description,Status,Priority,Project,Labels,Due Date",
		"omnifocus-csv": "Task ID,Type,Name,Status,Project,Context,Start Date,Due Date,Completion Date,Duration,Flagged,Notes,Tags",
		"notion-csv":    "Name,Status,Date",
	}
	for format, header := range headers {
		// An oversized field in the header row and in a data row.
		for _, data := range []string{
			header + ",\"" + big + "\"\n",
			header + "\n" + "task,\"" + big + "\"\n",
		} {
			_, err := Parse([]byte(data), Options{Format: format})
			var le *LimitError
			if !errors.As(err, &le) {
				t.Errorf("%s: err = %v, want *LimitError", format, err)
			}
		}
	}
}

func TestJSONNestingOverLimitRefused(t *testing.T) {
	deep := `{"tasks":` + strings.Repeat("[", MaxJSONDepth) + strings.Repeat("]", MaxJSONDepth) + `}`
	_, err := Parse([]byte(deep), Options{})
	wantLimit(t, "json", err, "nested more than")

	// Brackets inside strings do not count.
	quoted := `[{"title":"` + strings.Repeat("[{", MaxJSONDepth) + `\"]"}]`
	if err := checkJSONDepth([]byte(quoted)); err != nil {
		t.Fatalf("brackets in a string: %v", err)
	}
	// At the limit is fine.
	if err := checkJSONDepth([]byte(strings.Repeat("[", MaxJSONDepth) + strings.Repeat("]", MaxJSONDepth))); err != nil {
		t.Fatalf("at the limit: %v", err)
	}
	// With a byte order mark.
	if err := checkShape([]byte("\xef\xbb\xbf" + deep)); err == nil {
		t.Fatal("a byte order mark hid the nesting")
	}
}

// A JSON file inside a ZIP is checked like an uploaded one.
func TestJSONNestingInArchiveRefused(t *testing.T) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	w, err := zw.Create("export.json")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = w.Write([]byte(`{"format":"opentodo-export","version":1,"entities":` + strings.Repeat("[", MaxJSONDepth+1) + strings.Repeat("]", MaxJSONDepth+1) + `}`))
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	_, err = Parse(buf.Bytes(), Options{})
	wantLimit(t, "zip", err, "nested more than")
}
