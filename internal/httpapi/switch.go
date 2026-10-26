package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"reflect"

	"github.com/pixari/opentodo/internal/audit"
	"github.com/pixari/opentodo/internal/settings"
)

// Owner switches (OpenSpec change calendar-two-way, design D1): a boolean
// server setting read through a cache (settings.Switch), changed only by the
// owner with a settings.changed audit event, and a gate that answers 404 while
// it is off.

// switchRoute describes the GET and PUT routes of one owner switch.
type switchRoute struct {
	sw       *settings.Switch
	get, put routePolicy
	// field is the JSON field of the value ("enabled" when empty).
	field string
	// more adds fields to the GET answer and putMore to the PUT answer.
	more, putMore func(r *http.Request) map[string]any
	// after runs once the value is stored.
	after func(ctx context.Context, before, on bool)
}

// switchRoutes registers GET and PUT path for one owner switch.
func (s *Server) switchRoutes(mux *routes, path string, rt switchRoute) {
	if rt.field == "" {
		rt.field = "enabled"
	}
	input := reflect.StructOf([]reflect.StructField{{Name: "V", Type: reflect.TypeFor[*bool](), Tag: reflect.StructTag(`json:"` + rt.field + `"`)}})
	mux.handle("GET "+path, rt.get, func(w http.ResponseWriter, r *http.Request) {
		on, err := rt.sw.Read(r.Context())
		if err != nil {
			s.internal(w, err)
			return
		}
		writeJSON(w, http.StatusOK, switchBody(r, rt.field, on, rt.more))
	})
	mux.handle("PUT "+path, rt.put, func(w http.ResponseWriter, r *http.Request) {
		// A struct with the one field, so unknown fields are refused as for any body.
		in := reflect.New(input)
		if err := readJSON(r, in.Interface()); err != nil || in.Elem().Field(0).IsNil() {
			badBodyWith(w, err, "invalid_input", `body must be {"`+rt.field+`": true|false}`)
			return
		}
		on := *in.Elem().Field(0).Interface().(*bool)
		before, err := rt.sw.Set(r.Context(), on, func(tx *sql.Tx, before bool) error {
			return s.audit.RecordTx(r.Context(), tx, audit.SettingsChanged(userFrom(r.Context()).ID, rt.sw.Key(),
				boolText(before), boolText(on)))
		})
		if errors.Is(err, settings.ErrSetByEnvironment) {
			writeError(w, http.StatusConflict, "set_by_environment", rt.sw.FixedBy()+" sets this on the server")
			return
		} else if err != nil {
			s.internal(w, err)
			return
		}
		if rt.after != nil {
			rt.after(r.Context(), before, on)
		}
		writeJSON(w, http.StatusOK, switchBody(r, rt.field, on, rt.putMore))
	})
}

func switchBody(r *http.Request, field string, on bool, more func(r *http.Request) map[string]any) map[string]any {
	out := map[string]any{field: on}
	if more != nil {
		for k, v := range more(r) {
			out[k] = v
		}
	}
	return out
}

// boolText is a switch value in an audit event.
func boolText(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

// switchGate answers 404 with code and message while sw is off.
func switchGate(sw *settings.Switch, code, message string) func(http.HandlerFunc) http.HandlerFunc {
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if !sw.On(r.Context()) {
				writeError(w, http.StatusNotFound, code, message)
				return
			}
			next(w, r)
		}
	}
}
