package httpapi

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// TestEveryTestRunsInParallel keeps the package fast (improvement plan S4): each
// top-level test calls t.Parallel(), uses t.Setenv (which cannot run in
// parallel), or says why not in a "// Not parallel:" comment on its first line.
func TestEveryTestRunsInParallel(t *testing.T) {
	t.Parallel()
	files, err := filepath.Glob("*_test.go")
	if err != nil {
		t.Fatal(err)
	}
	head := regexp.MustCompile(`(?m)^func (Test\w+)\((\w+) \*testing\.T\) \{\n`)
	var missing []string
	for _, f := range files {
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		src := string(b)
		for _, m := range head.FindAllStringSubmatchIndex(src, -1) {
			name, tv := src[m[2]:m[3]], src[m[4]:m[5]]
			body := src[m[1]:]
			if end := strings.Index(body, "\n}\n"); end >= 0 {
				body = body[:end]
			}
			first, _, _ := strings.Cut(body, "\n")
			if strings.TrimSpace(first) == tv+".Parallel()" || strings.HasPrefix(strings.TrimSpace(first), "// Not parallel:") || strings.Contains(body, ".Setenv(") {
				continue
			}
			missing = append(missing, f+": "+name)
		}
	}
	if len(missing) > 0 {
		t.Fatalf("tests that neither call t.Parallel() first nor say why not (\"// Not parallel: <reason>\" on the first line):\n  %s", strings.Join(missing, "\n  "))
	}
}
