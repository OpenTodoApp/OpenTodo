package httpapi

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	_ "image/jpeg" // the owner's logo may be a JPEG
	"image/png"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"unicode"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/imgfit"
	"github.com/pixari/opentodo/internal/settings"
	"github.com/pixari/opentodo/internal/web"
)

// Instance branding (OpenSpec change instance-branding, issue #234): the owner
// gives the instance a name and a logo. The name replaces "OpenTodo" in the
// page title, the manifest and the app's wordmark; the logo, uploaded once as a
// PNG or JPEG, is rendered into the sizes the favicon, the touch icon, the
// installed app and the sidebar need and served from /branding/. The page and
// the manifest are rewritten on the way out of the embedded web app, so the
// build stays one binary. "Powered by OpenTodo" stays on the sign-in screen.

const (
	brandingSettingKey  = "branding"
	brandingNameMax     = 40
	brandingLogoMax     = 2 << 20
	brandingLogoMinSide = 192
	brandingLogoMaxSide = 4096
)

// brandingLogoSizes are the rendered files: the favicon, the touch icon, the
// manifest icons and the sidebar.
var brandingLogoSizes = []int{32, 180, 192, 512}

// brandingSetting is the stored value.
type brandingSetting struct {
	Name string `json:"name"`
	// LogoVersion is 0 or less without a logo (a removed logo keeps its last
	// version negated, so the next one gets a new address), else the version in
	// the logo's addresses.
	LogoVersion int `json:"logo_version"`
}

func (b brandingSetting) logo() int { return max(0, b.LogoVersion) }

func (b brandingSetting) web() web.Branding {
	return web.Branding{Name: b.Name, LogoVersion: b.logo()}
}

// brandingState caches the setting; nil means not loaded.
type brandingState struct {
	v atomic.Pointer[brandingSetting]
}

func (s *Server) registerBrandingRoutes(mux *routes) {
	mux.handle("GET /api/v1/settings/branding", ownerOnly("see the branding"), s.handleGetBranding)
	mux.handle("PUT /api/v1/settings/branding", ownerOnly("change the branding").demoDenied(), s.handlePutBranding)
	mux.handle("PUT /api/v1/settings/branding/logo", ownerOnly("change the logo").demoDenied(), s.handlePutBrandingLogo)
	mux.handle("DELETE /api/v1/settings/branding/logo", ownerOnly("remove the logo").demoDenied(), s.handleDeleteBrandingLogo)
	// The logo is part of the page every visitor sees, like the app's own icons.
	mux.handle("GET /branding/{file}", public("the instance logo, part of the page like the app's icons"), s.handleBrandingLogo)
}

// branding reads the setting through the cache.
func (s *Server) branding(r *http.Request) brandingSetting {
	if b := s.brand.v.Load(); b != nil {
		return *b
	}
	var b brandingSetting
	if _, err := settings.New(s.sync.DB()).Get(r.Context(), brandingSettingKey, &b); err != nil {
		s.log.Warn("read branding", "err", err)
		return brandingSetting{}
	}
	s.brand.v.Store(&b)
	return b
}

func (s *Server) setBranding(r *http.Request, b brandingSetting) error {
	if err := settings.New(s.sync.DB()).Set(r.Context(), brandingSettingKey, b); err != nil {
		return err
	}
	s.brand.v.Store(&b)
	return nil
}

// brandingJSON is what the settings and the status report.
func brandingJSON(b brandingSetting) map[string]any {
	return map[string]any{"name": b.Name, "logoVersion": b.logo()}
}

func (s *Server) handleGetBranding(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, brandingJSON(s.branding(r)))
}

// validBrandingName trims and checks a name: at most 40 characters, no control characters.
func validBrandingName(raw string) (string, bool) {
	name := strings.TrimSpace(raw)
	if len([]rune(name)) > brandingNameMax {
		return "", false
	}
	for _, c := range name {
		if unicode.IsControl(c) {
			return "", false
		}
	}
	return name, true
}

func (s *Server) handlePutBranding(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name *string `json:"name"`
	}
	if err := readJSON(r, &in); err != nil {
		badBodyWith(w, err, "invalid_input", "a JSON body with a name is required")
		return
	}
	if in.Name == nil {
		writeError(w, http.StatusBadRequest, "invalid_input", "name: required")
		return
	}
	name, ok := validBrandingName(*in.Name)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_input", "name: at most 40 characters, no control characters")
		return
	}
	cur := s.branding(r)
	if name != cur.Name {
		next := cur
		next.Name = name
		if err := s.setBranding(r, next); err != nil {
			s.internal(w, err)
			return
		}
		s.audit.Record(r.Context(), audit.SettingsChanged(userFrom(r.Context()).ID, "branding.name", cur.Name, name))
	}
	writeJSON(w, http.StatusOK, brandingJSON(s.branding(r)))
}

// brandingDir is where the rendered logos live; "" without a data directory.
func (s *Server) brandingDir() string {
	if s.cfg.DataDir == "" {
		return ""
	}
	return filepath.Join(s.cfg.DataDir, "branding")
}

func brandingLogoName(size string) string { return "logo-" + size + ".png" }

func (s *Server) handlePutBrandingLogo(w http.ResponseWriter, r *http.Request) {
	dir := s.brandingDir()
	if dir == "" {
		writeError(w, http.StatusNotFound, "not_found", "a logo needs a data directory")
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, brandingLogoMax))
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		writeError(w, http.StatusRequestEntityTooLarge, "too_large", "the logo must be at most 2 MB")
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_input", "the logo could not be read")
		return
	}
	files, err := renderLogo(body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_input", err.Error())
		return
	}
	for name, data := range files {
		if err := writeAvatarFile(filepath.Join(dir, name), data); err != nil {
			s.internal(w, err)
			return
		}
	}
	cur := s.branding(r)
	next := cur
	next.LogoVersion = max(cur.LogoVersion, -cur.LogoVersion) + 1
	if err := s.setBranding(r, next); err != nil {
		s.internal(w, err)
		return
	}
	s.audit.Record(r.Context(), audit.SettingsChanged(userFrom(r.Context()).ID, "branding.logo", strconv.Itoa(cur.logo()), strconv.Itoa(next.LogoVersion)))
	writeJSON(w, http.StatusOK, brandingJSON(next))
}

func (s *Server) handleDeleteBrandingLogo(w http.ResponseWriter, r *http.Request) {
	cur := s.branding(r)
	if dir := s.brandingDir(); dir != "" {
		for _, size := range append([]string{"maskable-512"}, sizeNames()...) {
			if err := os.Remove(filepath.Join(dir, brandingLogoName(size))); err != nil && !errors.Is(err, os.ErrNotExist) {
				s.internal(w, err)
				return
			}
		}
	}
	if cur.LogoVersion > 0 {
		next := cur
		next.LogoVersion = -cur.LogoVersion
		if err := s.setBranding(r, next); err != nil {
			s.internal(w, err)
			return
		}
		s.audit.Record(r.Context(), audit.SettingsChanged(userFrom(r.Context()).ID, "branding.logo", strconv.Itoa(cur.LogoVersion), "0"))
	}
	writeJSON(w, http.StatusOK, brandingJSON(s.branding(r)))
}

func sizeNames() []string {
	out := make([]string, 0, len(brandingLogoSizes))
	for _, n := range brandingLogoSizes {
		out = append(out, strconv.Itoa(n))
	}
	return out
}

// renderLogo decodes an uploaded PNG or JPEG (square-ish is best: the centre
// square is used) and renders every served size plus the maskable icon, whose
// background is the logo's own edge colour (or the app's dark canvas when the
// edge is transparent).
func renderLogo(body []byte) (map[string][]byte, error) {
	cfg, format, err := image.DecodeConfig(bytes.NewReader(body))
	if err != nil || (format != "png" && format != "jpeg") {
		return nil, errors.New("upload a PNG or JPEG image")
	}
	if cfg.Width < brandingLogoMinSide || cfg.Height < brandingLogoMinSide {
		return nil, errors.New("the logo must be at least 192 pixels on each side")
	}
	if cfg.Width > brandingLogoMaxSide || cfg.Height > brandingLogoMaxSide {
		return nil, errors.New("the logo must be at most 4096 pixels on each side")
	}
	img, _, err := image.Decode(bytes.NewReader(body))
	if err != nil {
		return nil, errors.New("the image could not be read")
	}
	files := map[string][]byte{}
	encode := func(name string, m image.Image) error {
		var out bytes.Buffer
		if err := png.Encode(&out, m); err != nil {
			return err
		}
		files[name] = out.Bytes()
		return nil
	}
	for _, size := range brandingLogoSizes {
		if err := encode(brandingLogoName(strconv.Itoa(size)), imgfit.Square(img, size)); err != nil {
			return nil, err
		}
	}
	if err := encode(brandingLogoName("maskable-512"), imgfit.Pad(img, 512, 0.8, edgeColour(img))); err != nil {
		return nil, err
	}
	return files, nil
}

// edgeColour is the colour at the image's corners when it is opaque, else the
// app's dark canvas: the field a maskable icon shows around the logo.
func edgeColour(img image.Image) color.Color {
	b := img.Bounds()
	var r, g, bl, a uint32
	for _, p := range []image.Point{b.Min, {b.Max.X - 1, b.Min.Y}, {b.Min.X, b.Max.Y - 1}, {b.Max.X - 1, b.Max.Y - 1}} {
		cr, cg, cb, ca := img.At(p.X, p.Y).RGBA()
		r, g, bl, a = r+cr/4, g+cg/4, bl+cb/4, a+ca/4
	}
	if a < 0xff00 {
		return color.RGBA{0x0f, 0x17, 0x2a, 0xff}
	}
	return color.RGBA64{uint16(r), uint16(g), uint16(bl), 0xffff}
}

// handleBrandingLogo serves one rendered size; the current version's address is
// cacheable for good.
func (s *Server) handleBrandingLogo(w http.ResponseWriter, r *http.Request) {
	b := s.branding(r)
	name := path.Base(r.PathValue("file"))
	known := name == brandingLogoName("maskable-512")
	for _, size := range sizeNames() {
		known = known || name == brandingLogoName(size)
	}
	dir := s.brandingDir()
	if !known || b.logo() == 0 || dir == "" {
		http.NotFound(w, r)
		return
	}
	data, err := os.ReadFile(filepath.Join(dir, name))
	if errors.Is(err, os.ErrNotExist) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		s.internal(w, err)
		return
	}
	if r.URL.Query().Get("v") == strconv.Itoa(b.logo()) {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	} else {
		w.Header().Set("Cache-Control", "no-cache")
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	_, _ = w.Write(data)
}

// brandedWeb wraps the embedded web app: the page (every navigation) and the
// manifest are rewritten for a branded instance; everything else, and every
// unbranded instance, passes straight through.
func (s *Server) brandedWeb(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			next.ServeHTTP(w, r)
			return
		}
		p := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		manifest := p == "manifest.webmanifest"
		page := p == "" || p == "index.html" || (path.Ext(p) == "" && !strings.HasPrefix(p, "assets/"))
		if !manifest && !page {
			next.ServeHTTP(w, r)
			return
		}
		b := s.branding(r)
		if !b.web().Active() {
			next.ServeHTTP(w, r)
			return
		}
		cw := &captureWriter{header: http.Header{}, status: http.StatusOK}
		next.ServeHTTP(cw, r)
		body := cw.body.Bytes()
		if cw.status == http.StatusOK {
			if manifest {
				body = web.BrandManifest(body, b.web())
			} else {
				body = web.Brand(body, b.web())
			}
		}
		h := w.Header()
		for k, v := range cw.header {
			h[k] = v
		}
		h.Del("Content-Length")
		if cw.status == http.StatusOK {
			h.Set("Content-Length", strconv.Itoa(len(body)))
		}
		w.WriteHeader(cw.status)
		if r.Method != http.MethodHead {
			_, _ = w.Write(body)
		}
	})
}

// captureWriter buffers a response so it can be rewritten.
type captureWriter struct {
	header http.Header
	status int
	body   bytes.Buffer
}

func (c *captureWriter) Header() http.Header         { return c.header }
func (c *captureWriter) WriteHeader(code int)        { c.status = code }
func (c *captureWriter) Write(p []byte) (int, error) { return c.body.Write(p) }
