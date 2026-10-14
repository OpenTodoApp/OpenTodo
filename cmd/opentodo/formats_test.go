package main

import (
	"bytes"
	"encoding/json"
	"slices"
	"testing"

	"github.com/pixari/opentodo/internal/importer"
)

// site-bundle 2.2: the manifest's importFormats come from this output.
func TestPrintFormats(t *testing.T) {
	var buf bytes.Buffer
	if err := printFormats(&buf); err != nil {
		t.Fatal(err)
	}
	var got []string
	if err := json.Unmarshal(buf.Bytes(), &got); err != nil {
		t.Fatalf("not a JSON array of strings: %q (%v)", buf.String(), err)
	}
	if !slices.Equal(got, importer.ProfileNames()) || len(got) == 0 || !slices.Contains(got, "opentodo") {
		t.Fatalf("formats = %v", got)
	}
}
