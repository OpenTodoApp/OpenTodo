package config

import (
	"fmt"
	"os"
	"strings"
)

// loadAutomations reads the optional OPENTODO_AUTOMATIONS=on|off (OpenSpec
// change automation-rules, design D9): set, it overrides the owner's
// automations.enabled setting and makes it read-only; an invalid value stops
// startup naming the variable.
func (c *Config) loadAutomations() error {
	switch v := strings.ToLower(strings.TrimSpace(os.Getenv("OPENTODO_AUTOMATIONS"))); v {
	case "":
	case "on", "true", "1", "yes":
		on := true
		c.Automations = &on
	case "off", "false", "0", "no":
		off := false
		c.Automations = &off
	default:
		return fmt.Errorf("OPENTODO_AUTOMATIONS must be on or off, got %q", os.Getenv("OPENTODO_AUTOMATIONS"))
	}
	return nil
}
