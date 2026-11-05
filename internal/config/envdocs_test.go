package config

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// The configuration reference lists every OPENTODO_* variable the code reads
// (OpenSpec change docs-1-0, documentation "Configuration reference is
// complete"). The names are the string literals of the whole variable name in
// the non-test Go files under cmd/ and internal/: a read through os.Getenv, a
// helper or a table of names all spell the full name once. A prefix such as
// "OPENTODO_BACKUP_" (ending in "_") is not a variable.

const configReference = "docs/self-hosting/configuration.md"

var envName = regexp.MustCompile(`^OPENTODO_[A-Z0-9_]*[A-Z0-9]$`)

// envVarsRead returns each variable name with the first file that names it.
func envVarsRead(t *testing.T, root string) map[string]string {
	t.Helper()
	found := map[string]string{}
	fset := token.NewFileSet()
	for _, dir := range []string{"cmd", "internal"} {
		err := filepath.WalkDir(filepath.Join(root, dir), func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() {
				if d.Name() == "testdata" {
					return filepath.SkipDir
				}
				return nil
			}
			if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
				return nil
			}
			f, err := parser.ParseFile(fset, path, nil, parser.SkipObjectResolution)
			if err != nil {
				return err
			}
			rel, _ := filepath.Rel(root, path)
			ast.Inspect(f, func(n ast.Node) bool {
				lit, ok := n.(*ast.BasicLit)
				if !ok || lit.Kind != token.STRING {
					return true
				}
				s, err := strconv.Unquote(lit.Value)
				if err == nil && envName.MatchString(s) {
					if _, seen := found[s]; !seen {
						found[s] = filepath.ToSlash(rel)
					}
				}
				return true
			})
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	return found
}

var referenceRow = regexp.MustCompile("^\\|\\s*`(OPENTODO_[A-Z0-9_]+)`\\s*\\|")

// envVarsDocumented returns each variable named in the first column of a table
// row of the reference, with its line number.
func envVarsDocumented(t *testing.T, path string) map[string]int {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	out := map[string]int{}
	for i, line := range strings.Split(string(b), "\n") {
		if m := referenceRow.FindStringSubmatch(line); m != nil {
			if prev, dup := out[m[1]]; dup {
				t.Errorf("%s:%d: %s is already listed on line %d", configReference, i+1, m[1], prev)
			}
			out[m[1]] = i + 1
		}
	}
	return out
}

func repoRoot(t *testing.T) string {
	t.Helper()
	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}
	return root
}

func TestConfigurationReferenceIsComplete(t *testing.T) {
	root := repoRoot(t)
	read := envVarsRead(t, root)
	documented := envVarsDocumented(t, filepath.Join(root, configReference))
	if len(read) == 0 || len(documented) == 0 {
		t.Fatalf("found %d variables in the code and %d in %s", len(read), len(documented), configReference)
	}
	for _, p := range envProblems(read, documented) {
		t.Error(p)
	}
}

// envProblems compares the two sets both ways, sorted for stable output.
func envProblems(read map[string]string, documented map[string]int) []string {
	var out []string
	for name, file := range read {
		if _, ok := documented[name]; !ok {
			out = append(out, file+" reads "+name+", which "+configReference+" does not list")
		}
	}
	for name, line := range documented {
		if _, ok := read[name]; !ok {
			out = append(out, configReference+":"+strconv.Itoa(line)+": "+name+" is listed but no code reads it")
		}
	}
	sort.Strings(out)
	return out
}

func TestEnvProblemsBothWays(t *testing.T) {
	got := envProblems(
		map[string]string{"OPENTODO_A": "internal/a/a.go", "OPENTODO_MAPS_CACHE_MB": "internal/maps/cache.go"},
		map[string]int{"OPENTODO_A": 3, "OPENTODO_GONE": 9},
	)
	want := []string{
		configReference + ":9: OPENTODO_GONE is listed but no code reads it",
		"internal/maps/cache.go reads OPENTODO_MAPS_CACHE_MB, which " + configReference + " does not list",
	}
	if strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Fatalf("got\n%s\nwant\n%s", strings.Join(got, "\n"), strings.Join(want, "\n"))
	}
}
