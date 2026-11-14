package notelinks

import "testing"

func TestStrip(t *testing.T) {
	for in, want := range map[string]string{
		"See [Door code](?note=n1) and [Buy paint](?task=t_2).": "See Door code and Buy paint.",
		"[**Bold** title](?project=p1)":                         "**Bold** title",
		"Keep `[code](?note=n1)` and [web](https://x.example)":  "Keep `[code](?note=n1)` and [web](https://x.example)",
		"```\n[in fence](?note=n1)\n```\n[out](?note=n2)":       "```\n[in fence](?note=n1)\n```\nout",
		`\[escaped](?note=n1)`:                                  `\[escaped](?note=n1)`,
		"[A \\] b](?note=n1) end":                               "A \\] b end",
		"no links":                                              "no links",
	} {
		if got := Strip(in); got != want {
			t.Errorf("Strip(%q) = %q, want %q", in, got, want)
		}
		if got := LinksIn(Strip(in)); len(got) != 0 && in != "Keep `[code](?note=n1)` and [web](https://x.example)" && in != `\[escaped](?note=n1)` {
			t.Errorf("Strip(%q) left links %v", in, got)
		}
	}
}
