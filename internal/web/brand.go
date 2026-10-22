package web

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"regexp"
	"unicode/utf8"
)

// Branding is the owner's instance branding (OpenSpec change instance-branding):
// a name shown in place of "OpenTodo" and, with LogoVersion above 0, a logo
// served at /branding/logo-<size>.png?v=<version> in place of the app's mark.
type Branding struct {
	Name        string
	LogoVersion int
}

// Active reports whether anything is branded.
func (b Branding) Active() bool { return b.Name != "" || b.LogoVersion > 0 }

// LogoPath is the address of one rendered size of the logo.
func (b Branding) LogoPath(size string) string {
	return fmt.Sprintf("/branding/logo-%s.png?v=%d", size, b.LogoVersion)
}

var (
	titleTag    = regexp.MustCompile(`<title>[^<]*</title>`)
	iconLink    = regexp.MustCompile(`<link[^>]*\brel="icon"[^>]*>`)
	touchLink   = regexp.MustCompile(`<link[^>]*\brel="apple-touch-icon"[^>]*>`)
	descMeta    = regexp.MustCompile(`(<meta name="description" content=")[^"]*(")`)
	appleTitleM = regexp.MustCompile(`(<meta name="apple-mobile-web-app-title" content=")[^"]*(")`)
)

// Brand rewrites the app page for a branded instance: the title, the favicon
// and the touch icon. An unbranded instance gets the page unchanged.
func Brand(page []byte, b Branding) []byte {
	if !b.Active() {
		return page
	}
	out := page
	if b.Name != "" {
		name := html.EscapeString(b.Name)
		out = titleTag.ReplaceAll(out, []byte("<title>"+name+"</title>"))
		out = descMeta.ReplaceAll(out, []byte("${1}"+name+"${2}"))
		out = appleTitleM.ReplaceAll(out, []byte("${1}"+name+"${2}"))
	}
	if b.LogoVersion > 0 {
		out = iconLink.ReplaceAll(out, []byte(`<link rel="icon" href="`+b.LogoPath("32")+`" type="image/png">`))
		out = touchLink.ReplaceAll(out, []byte(`<link rel="apple-touch-icon" href="`+b.LogoPath("180")+`">`))
	}
	return out
}

// BrandManifest rewrites the web app manifest: the name and short name, and
// the icons when there is a logo. A manifest that does not parse is returned
// unchanged.
func BrandManifest(manifest []byte, b Branding) []byte {
	if !b.Active() {
		return manifest
	}
	var m map[string]any
	if err := json.Unmarshal(manifest, &m); err != nil {
		return manifest
	}
	if b.Name != "" {
		m["name"] = b.Name
		m["short_name"] = shortName(b.Name)
	}
	if b.LogoVersion > 0 {
		m["icons"] = []map[string]string{
			{"src": b.LogoPath("192"), "sizes": "192x192", "type": "image/png"},
			{"src": b.LogoPath("512"), "sizes": "512x512", "type": "image/png"},
			{"src": b.LogoPath("maskable-512"), "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
			{"src": b.LogoPath("180"), "sizes": "180x180", "type": "image/png"},
		}
	}
	var out bytes.Buffer
	enc := json.NewEncoder(&out)
	enc.SetEscapeHTML(false) // a name with < or & reads as written in the manifest
	if err := enc.Encode(m); err != nil {
		return manifest
	}
	return bytes.TrimRight(out.Bytes(), "\n")
}

// shortName keeps the manifest's short_name within the 12 characters launchers show.
func shortName(name string) string {
	if utf8.RuneCountInString(name) <= 12 {
		return name
	}
	runes := []rune(name)
	return string(bytes.TrimRight([]byte(string(runes[:12])), " "))
}
