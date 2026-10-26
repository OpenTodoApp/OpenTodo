package email

import (
	"strings"
	"testing"
	"time"
)

// TestHTMLToMarkdownLinearOnHostileInput: any sender reaches HTMLToMarkdown
// (the body is parsed before the message is routed). Tags that never end,
// unclosed quotes, and deep nesting of marks, links and lists used to take time
// or memory quadratic in the message size: 160 KB of "<a" took 15 s, and 10 MB
// of "<ul>" asked for terabytes of list indents. Each input here is 1-2 MB and
// must convert in a fraction of the old time.
func TestHTMLToMarkdownLinearOnHostileInput(t *testing.T) {
	cases := map[string]string{
		"unterminated tags":     strings.Repeat("<a", 500_000),
		"unclosed quotes":       strings.Repeat(`<a x="`, 200_000) + ">",
		"deep marks, wrong end": strings.Repeat("<b>", 300_000) + "x" + strings.Repeat("</a>", 300_000),
		"deep marks with text":  strings.Repeat("<b>x", 300_000),
		"deep lists":            strings.Repeat("<ul><li>x", 200_000),
		"many links":            strings.Repeat("<a href='http://x'>y", 100_000),
	}
	for name, in := range cases {
		t.Run(name, func(t *testing.T) {
			done := make(chan string, 1)
			go func() { done <- HTMLToMarkdown(in) }()
			select {
			case out := <-done:
				if len(out) > 10*len(in) {
					t.Fatalf("%d bytes became %d", len(in), len(out))
				}
			case <-time.After(20 * time.Second):
				t.Fatal("HTMLToMarkdown did not finish in 20 s")
			}
		})
	}
	// The text of an unterminated tag is kept, not dropped.
	if got := HTMLToMarkdown("Hello <b>world</b> and <a then nothing"); got != "Hello **world** and <a then nothing" {
		t.Fatalf("got %q", got)
	}
}
