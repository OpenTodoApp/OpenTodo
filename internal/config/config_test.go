package config

import (
	"strconv"
	"strings"
	"testing"
)

func TestConfigImportMaxMB(t *testing.T) {
	t.Setenv("OPENTODO_IMPORT_MAX_MB", "")
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if c.ImportMaxMB != 20 || c.ImportMaxBytes() != 20<<20 {
		t.Fatalf("default = %d MB", c.ImportMaxMB)
	}
	if (Config{}).ImportMaxBytes() != 20<<20 {
		t.Fatal("zero Config must use the default limit")
	}
	for _, ok := range []string{"1", "64", "200"} {
		t.Setenv("OPENTODO_IMPORT_MAX_MB", ok)
		c, err := Load()
		n, _ := strconv.Atoi(ok)
		if err != nil || c.ImportMaxBytes() != int64(n)<<20 {
			t.Fatalf("%s: %v %d", ok, err, c.ImportMaxMB)
		}
	}
	// An invalid value stops startup with an error naming the variable.
	for _, bad := range []string{"0", "201", "-3", "ten", "1.5"} {
		t.Setenv("OPENTODO_IMPORT_MAX_MB", bad)
		if _, err := Load(); err == nil || !strings.Contains(err.Error(), "OPENTODO_IMPORT_MAX_MB") {
			t.Fatalf("%q: err = %v", bad, err)
		}
	}
}
