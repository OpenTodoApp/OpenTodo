package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The optional speech-to-text variables (settings-refresh D7): none is required.
func TestLoadSTT(t *testing.T) {
	key := filepath.Join(t.TempDir(), "key")
	if err := os.WriteFile(key, []byte(" sk-test \n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("OPENTODO_STT_URL", "http://stt.home.lan:8000/")
	t.Setenv("OPENTODO_STT_MODEL", " Systran/faster-whisper-small ")
	t.Setenv("OPENTODO_STT_KEY_FILE", key)
	var c Config
	if err := c.loadSTT(); err != nil {
		t.Fatal(err)
	}
	if c.STT != (STTConfig{URL: "http://stt.home.lan:8000", Model: "Systran/faster-whisper-small", Key: "sk-test", KeyFromEnv: true}) {
		t.Fatalf("stt = %+v", c.STT)
	}
	t.Setenv("OPENTODO_STT_URL", "ftp://stt.home.lan")
	if err := (&Config{}).loadSTT(); err == nil || !strings.Contains(err.Error(), "OPENTODO_STT_URL") {
		t.Fatalf("ftp = %v", err)
	}
	t.Setenv("OPENTODO_STT_URL", "")
	t.Setenv("OPENTODO_STT_MODEL", "")
	t.Setenv("OPENTODO_STT_KEY_FILE", "")
	var none Config
	if err := none.loadSTT(); err != nil || none.STT != (STTConfig{}) {
		t.Fatalf("unset = %+v %v", none.STT, err)
	}
}
