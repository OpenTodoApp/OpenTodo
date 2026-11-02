// Package themes validates theme documents (OpenSpec change theme-engine, design
// D1, D2, D13): the versioned JSON format of seeds and optional token values that
// sets the web app's colours, corners and type. It is the server's copy of
// web/src/lib/theme/format.ts; both accept and refuse exactly the documents of
// testdata/ with the same codes (docs/contracts.md). There is no derivation and
// no renderer here: the server never draws a theme. Later changes use Validate
// for synced user themes and the instance's themes.
package themes

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"unicode/utf8"
)

// Format is the document format this server reads.
const Format = 1

// MaxBytes is the largest document, in bytes of UTF-8 JSON.
const MaxBytes = 16 * 1024

// GamutTolerance is how far outside 0..1 a channel may land and still count as
// inside the sRGB gamut (rounding of written values); the same as the web app's.
const GamutTolerance = 0.001

// Error is a refused document: Code is one of the codes the web app's validator
// returns for the same document, Path the key it stopped at.
type Error struct {
	Code string
	Path string
}

func (e *Error) Error() string { return fmt.Sprintf("theme document: %s at %q", e.Code, e.Path) }

// ErrNewer is the code of a document of a newer format than this server reads.
const ErrNewer = "newer"

const num = `(\d+(?:\.\d+)?|\.\d+)`

var (
	oklchRe  = regexp.MustCompile(`^oklch\([ \t]*` + num + `[ \t]+` + num + `[ \t]+` + num + `[ \t]*(?:/[ \t]*` + num + `[ \t]*)?\)$`)
	hexRe    = regexp.MustCompile(`^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$`)
	idRe     = regexp.MustCompile(`^[a-z0-9-]{1,64}$`)
	tokenRe  = regexp.MustCompile(`^[a-z0-9-]{1,40}$`)
	topKeyRe = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9]{0,39}$`)
	fontRe   = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9 -]{0,63}$`)
)

var (
	knownKeys     = []string{"$schema", "opentodoTheme", "id", "name", "author", "licence", "source", "kind", "seeds", "tokens", "bar", "notes", "shape", "type"}
	requiredSeeds = []string{"canvas", "surface", "text", "accent"}
	radiusSteps   = []string{"chip", "control", "card", "surface", "popover"}
	families      = []string{"inter", "system", "serif", "mono"}
)

// alphaToken is the only token that may be translucent.
const alphaToken = "scrim"

type refusal struct{ err *Error }

func fail(code, path string) { panic(refusal{&Error{Code: code, Path: path}}) }

// Validate checks a document against format 1 (design D1): the size, then JSON,
// then every rule. Unknown token names and top-level keys are allowed and kept.
// A document of a newer format is refused with the code ErrNewer.
func Validate(doc []byte) (err error) {
	if len(doc) > MaxBytes {
		return &Error{Code: "size"}
	}
	var v any
	if json.Unmarshal(doc, &v) != nil {
		return &Error{Code: "json"}
	}
	defer func() {
		if r := recover(); r != nil {
			ref, ok := r.(refusal)
			if !ok {
				panic(r)
			}
			err = ref.err
		}
	}()
	validate(v)
	return nil
}

// Code returns the refusal code of an error from Validate, or "" for nil or another error.
func Code(err error) string {
	var e *Error
	if errors.As(err, &e) {
		return e.Code
	}
	return ""
}

// Migrate brings a document of an older known format to the current one (design
// D2). There is only format 1, so it returns the document unchanged.
func Migrate(doc []byte) []byte { return doc }

func sortedKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	return keys
}

func validate(v any) {
	d, ok := v.(map[string]any)
	if !ok {
		fail("json", "")
	}
	ver, ok := d["opentodoTheme"].(float64)
	if !ok || ver != math.Trunc(ver) || ver < 1 {
		fail("version", "opentodoTheme")
	}
	if ver > Format {
		fail(ErrNewer, "opentodoTheme")
	}
	if id, ok := d["id"].(string); !ok || !idRe.MatchString(id) {
		fail("id", "id")
	}
	text(d["name"], "name", 60, "name", 1)
	text(d["author"], "author", 120, "text", 0)
	text(d["licence"], "licence", 120, "text", 0)
	// "$schema" names the JSON Schema for an editor (a theme template carries it); text only, never fetched.
	if s, ok := d["$schema"]; ok {
		text(s, "$schema", 300, "key", 0)
	}
	if s, ok := d["source"]; ok {
		text(s, "source", 300, "text", 0)
	}
	if k := d["kind"]; k != "light" && k != "dark" {
		fail("kind", "kind")
	}
	seeds(d["seeds"])
	if t, ok := d["tokens"]; ok {
		tokens(t)
	}
	if b, ok := d["bar"]; ok {
		if code := colourError(b, false); code != "" {
			if code == "colour" {
				code = "bar"
			}
			fail(code, "bar")
		}
	}
	if n, ok := d["notes"]; ok {
		notes(n)
	}
	if s, ok := d["shape"]; ok {
		shape(s)
	}
	if t, ok := d["type"]; ok {
		typ(t)
	}
	for _, k := range sortedKeys(d) {
		if !slices.Contains(knownKeys, k) && !topKeyRe.MatchString(k) {
			fail("key", k)
		}
	}
}

func text(v any, path string, maxChars int, code string, minChars int) {
	s, ok := v.(string)
	if !ok || utf8.RuneCountInString(s) > maxChars || utf8.RuneCountInString(strings.TrimSpace(s)) < minChars {
		fail(code, path)
	}
}

func colour(v any, path string, alpha bool) {
	if code := colourError(v, alpha); code != "" {
		fail(code, path)
	}
}

// colourError returns the code of the first colour rule v breaks, or "".
func colourError(v any, alpha bool) string {
	s, ok := v.(string)
	if !ok {
		return "colour"
	}
	if m := hexRe.FindStringSubmatch(s); m != nil {
		if m[1] != "" && !alpha {
			return "alpha"
		}
		return ""
	}
	m := oklchRe.FindStringSubmatch(s)
	if m == nil {
		return "colour"
	}
	f := func(x string) float64 { n, _ := strconv.ParseFloat(x, 64); return n }
	l, c, h := f(m[1]), f(m[2]), f(m[3])
	if m[4] != "" {
		if !alpha {
			return "alpha"
		}
		if f(m[4]) > 1 {
			return "colour"
		}
	}
	if l > 1 || c > 0.4 || h > 360 {
		return "colour"
	}
	r, g, b := oklchToSRGB(l, c, h)
	for _, x := range []float64{r, g, b} {
		if x < -GamutTolerance || x > 1+GamutTolerance {
			return "gamut"
		}
	}
	return ""
}

func seeds(v any) {
	m, ok := v.(map[string]any)
	if !ok {
		fail("seeds", "seeds")
	}
	for _, k := range requiredSeeds {
		if _, ok := m[k]; !ok {
			fail("seeds", "seeds."+k)
		}
	}
	for _, k := range sortedKeys(m) {
		if !tokenRe.MatchString(k) {
			fail("seeds", "seeds."+k)
		}
		colour(m[k], "seeds."+k, false)
	}
}

func tokens(v any) {
	m, ok := v.(map[string]any)
	if !ok {
		fail("tokens", "tokens")
	}
	for _, k := range sortedKeys(m) {
		if !tokenRe.MatchString(k) {
			fail("tokens", "tokens."+k)
		}
		colour(m[k], "tokens."+k, k == alphaToken)
	}
}

func notes(v any) {
	m, ok := v.(map[string]any)
	if !ok {
		fail("notes", "notes")
	}
	for _, k := range sortedKeys(m) {
		switch k {
		case "text":
			text(m[k], "notes.text", 500, "notes", 0)
		case "adapted":
			a, ok := m[k].(map[string]any)
			if !ok {
				fail("notes", "notes.adapted")
			}
			for _, t := range sortedKeys(a) {
				if !tokenRe.MatchString(t) {
					fail("notes", "notes.adapted."+t)
				}
				colour(a[t], "notes.adapted."+t, false)
			}
		default:
			fail("notes", "notes."+k)
		}
	}
}

func shape(v any) {
	m, ok := v.(map[string]any)
	if !ok {
		fail("shape", "shape")
	}
	for _, k := range sortedKeys(m) {
		if k != "radius" {
			fail("shape", "shape."+k)
		}
		r, ok := m[k].(map[string]any)
		if !ok {
			fail("shape", "shape.radius")
		}
		for _, s := range sortedKeys(r) {
			n, ok := r[s].(float64)
			if !slices.Contains(radiusSteps, s) || !ok || n != math.Trunc(n) || n < 0 || n > 20 {
				fail("shape", "shape.radius."+s)
			}
		}
	}
}

func typ(v any) {
	m, ok := v.(map[string]any)
	if !ok {
		fail("type", "type")
	}
	for _, k := range sortedKeys(m) {
		switch k {
		case "list":
			n, ok := m[k].(float64)
			if !ok || (n != 13 && n != 14 && n != 15) {
				fail("type", "type.list")
			}
		case "family":
			switch f := m[k].(type) {
			case string:
				if !slices.Contains(families, f) {
					fail("type", "type.family")
				}
			case map[string]any:
				name, ok := f["local"].(string)
				if len(f) != 1 || !ok || !fontRe.MatchString(name) {
					fail("type", "type.family")
				}
			default:
				fail("type", "type.family")
			}
		default:
			fail("type", "type."+k)
		}
	}
}

// oklchToSRGB converts OKLCH to gamma-encoded sRGB, unclamped (web/src/lib/colourMath.ts).
func oklchToSRGB(l, c, h float64) (r, g, b float64) {
	rad := h * math.Pi / 180
	A, B := c*math.Cos(rad), c*math.Sin(rad)
	lc := math.Pow(l+0.3963377774*A+0.2158037573*B, 3)
	mc := math.Pow(l-0.1055613458*A-0.0638541728*B, 3)
	sc := math.Pow(l-0.0894841775*A-1.291485548*B, 3)
	lin := [3]float64{
		4.0767416621*lc - 3.3077115913*mc + 0.2309699292*sc,
		-1.2684380046*lc + 2.6097574011*mc - 0.3413193965*sc,
		-0.0041960863*lc - 0.7034186147*mc + 1.707614701*sc,
	}
	enc := func(x float64) float64 {
		if x <= 0.0031308 {
			return 12.92 * x
		}
		return 1.055*math.Pow(x, 1/2.4) - 0.055
	}
	return enc(lin[0]), enc(lin[1]), enc(lin[2])
}
