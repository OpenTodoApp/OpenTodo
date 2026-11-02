package themes

// Builtin is the kind of every theme shipped with the web app
// (web/src/lib/theme/builtin/*.json), so the instance default (OpenSpec change
// theme-instance-default, design D1) can refuse an unknown id or a theme of the
// wrong kind. TestBuiltinMatchesWeb keeps it equal to the web app's documents.
var Builtin = map[string]string{
	"catppuccin-latte":  "light",
	"catppuccin-mocha":  "dark",
	"dracula":           "dark",
	"gruvbox-dark":      "dark",
	"gruvbox-light":     "light",
	"nord":              "dark",
	"one-dark":          "dark",
	"one-light":         "light",
	"opentodo-dark":     "dark",
	"opentodo-light":    "light",
	"rose-pine":         "dark",
	"rose-pine-dawn":    "light",
	"solarized-dark":    "dark",
	"solarized-light":   "light",
	"tokyo-night":       "dark",
	"tokyo-night-light": "light",
}

// DefaultBuiltin is OpenTodo's own theme of each side: choosing it as the
// instance default is the same as choosing none.
var DefaultBuiltin = map[string]string{"light": "opentodo-light", "dark": "opentodo-dark"}
