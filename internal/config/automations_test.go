package config

import (
	"strings"
	"testing"
)

// automation-rules "Switches": OPENTODO_AUTOMATIONS is optional; an invalid
// value stops startup naming the variable and the accepted values.
func TestAutomationsConfig(t *testing.T) {
	for _, c := range []struct {
		name, env string
		on        *bool
		err       bool
	}{
		{name: "unset"},
		{name: "on", env: "on", on: ptr(true)},
		{name: "off", env: "OFF", on: ptr(false)},
		{name: "invalid", env: "sometimes", err: true},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Setenv("OPENTODO_AUTOMATIONS", c.env)
			cfg, err := Load()
			if c.err {
				if err == nil || !strings.Contains(err.Error(), "OPENTODO_AUTOMATIONS") || !strings.Contains(err.Error(), "on or off") {
					t.Fatalf("err = %v", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if (cfg.Automations == nil) != (c.on == nil) || (c.on != nil && *cfg.Automations != *c.on) {
				t.Fatalf("automations = %v, want %v", cfg.Automations, c.on)
			}
		})
	}
}
