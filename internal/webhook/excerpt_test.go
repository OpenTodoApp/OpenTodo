package webhook

import (
	"strings"
	"testing"
)

func TestReadExcerptCapsAt1KB(t *testing.T) {
	got := readExcerpt(strings.NewReader(strings.Repeat("x", 5000)))
	if len(got) != ExcerptBytes {
		t.Fatalf("excerpt length %d", len(got))
	}
}
