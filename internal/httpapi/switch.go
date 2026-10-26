package httpapi

import (
	"context"
	"net/http"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/settings"
)

// ownerSwitch is an integration's owner switch (OpenSpec change
// calendar-two-way, design D1): a boolean server setting, off by default, read
// through a cache, never on on a demo instance, changed only by the owner with
// a settings.changed audit event, and a gate that answers 404 while it is off.
// Issue connections and calendar sync use it.
type ownerSwitch struct {
	key string
	// code and message are the gate's 404 refusal.
	code, message string
	cache         caldavState
}

// on reads the switch through the cache.
func (sw *ownerSwitch) on(ctx context.Context, s *Server) bool {
	if s.demo != nil {
		return false
	}
	switch sw.cache.v.Load() {
	case 1:
		return false
	case 2:
		return true
	}
	var on bool
	if _, err := settings.New(s.sync.DB()).Get(ctx, sw.key, &on); err != nil {
		s.log.Error("read owner switch", "setting", sw.key, "err", err)
		return false
	}
	sw.remember(on)
	return on
}

func (sw *ownerSwitch) remember(on bool) {
	if on {
		sw.cache.v.Store(2)
	} else {
		sw.cache.v.Store(1)
	}
}

// get answers {"enabled": bool} with extra fields from more (nil for none).
func (sw *ownerSwitch) get(s *Server, more func(r *http.Request) map[string]any) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		out := map[string]any{"enabled": sw.on(r.Context(), s)}
		if more != nil {
			for k, v := range more(r) {
				out[k] = v
			}
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// put stores {"enabled": bool} and audits a change.
func (sw *ownerSwitch) put(s *Server, after func(ctx context.Context, on bool)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Enabled *bool `json:"enabled"`
		}
		if err := readJSON(r, &in); err != nil || in.Enabled == nil {
			badBodyWith(w, err, "invalid_input", `body must be {"enabled": true|false}`)
			return
		}
		before := sw.on(r.Context(), s)
		if err := settings.New(s.sync.DB()).Set(r.Context(), sw.key, *in.Enabled); err != nil {
			s.internal(w, err)
			return
		}
		sw.remember(*in.Enabled)
		if before != *in.Enabled {
			s.audit.Record(r.Context(), audit.SettingsChanged(userFrom(r.Context()).ID, sw.key, boolText(before), boolText(*in.Enabled)))
			if after != nil {
				after(r.Context(), *in.Enabled)
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{"enabled": *in.Enabled})
	}
}

// gate answers 404 with the switch's refusal while it is off.
func (sw *ownerSwitch) gate(s *Server, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !sw.on(r.Context(), s) {
			writeError(w, http.StatusNotFound, sw.code, sw.message)
			return
		}
		next(w, r)
	}
}
