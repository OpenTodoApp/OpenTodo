package httpx

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"reflect"
	"strings"
)

// One decoder for JSON request bodies (SEC-14). A body holds exactly one JSON
// value of at most MaxJSONBody bytes (a route may set a smaller limit). Fields
// the target struct does not declare are refused, except by ReadJSONLoose for
// bodies that intentionally accept more: the sync exchange (op batches, so
// newer clients can send op properties older servers ignore), and the objects
// a browser builds, which grow over time (PushSubscription.toJSON(),
// PublicKeyCredential.toJSON()). A map target accepts any field by nature: the
// entity bodies of the REST routes, which their handlers validate field by field.
// Errors carry short messages written here, never the Go decoder's text.

// MaxJSONBody is the default limit of a JSON request body.
const MaxJSONBody = 4 << 20

// ErrBodyTooLarge is a body over the route's limit; it answers 413 too_large.
var ErrBodyTooLarge = errors.New("the request body is too large")

// bodyError is a refused body with a message safe to return.
type bodyError struct {
	msg   string
	cause error // io.EOF for an empty body, so optional bodies can be told apart
}

func (e *bodyError) Error() string { return e.msg }
func (e *bodyError) Unwrap() error { return e.cause }

// ReadJSON decodes the request body into dst, refusing unknown fields.
func ReadJSON(r *http.Request, dst any) error { return decodeJSON(r, dst, MaxJSONBody, true) }

// ReadJSONLoose is ReadJSON for the bodies listed above that accept fields dst
// does not declare.
func ReadJSONLoose(r *http.Request, dst any) error { return decodeJSON(r, dst, MaxJSONBody, false) }

// ReadJSONLimit is ReadJSON with a smaller size limit.
func ReadJSONLimit(r *http.Request, dst any, limit int64) error {
	return decodeJSON(r, dst, limit, true)
}

func decodeJSON(r *http.Request, dst any, limit int64, strict bool) error {
	r.Body = http.MaxBytesReader(nil, r.Body, limit)
	dec := json.NewDecoder(r.Body)
	if strict {
		dec.DisallowUnknownFields()
	}
	if err := dec.Decode(dst); err != nil {
		return bodyDecodeError(err)
	}
	// Exactly one value: anything after it but white space is refused.
	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			return ErrBodyTooLarge
		}
		return &bodyError{msg: "invalid JSON body: unexpected data after the JSON value"}
	}
	return nil
}

// bodyDecodeError turns a decoder error into ErrBodyTooLarge or a bodyError.
func bodyDecodeError(err error) error {
	var tooLarge *http.MaxBytesError
	var typeErr *json.UnmarshalTypeError
	switch {
	case errors.As(err, &tooLarge):
		return ErrBodyTooLarge
	case errors.Is(err, io.EOF):
		return &bodyError{msg: "a JSON body is required", cause: io.EOF}
	case errors.As(err, &typeErr):
		if typeErr.Field == "" {
			return &bodyError{msg: "invalid JSON body: expected " + jsonKind(typeErr.Type)}
		}
		return &bodyError{msg: fmt.Sprintf("invalid JSON body: %s must be %s", typeErr.Field, jsonKind(typeErr.Type))}
	case strings.HasPrefix(err.Error(), "json: unknown field "):
		// The decoder has no typed error for this one; the name is quoted JSON.
		return &bodyError{msg: "invalid JSON body: unknown field " + strings.TrimPrefix(err.Error(), "json: unknown field ")}
	default:
		return &bodyError{msg: "invalid JSON body"}
	}
}

// jsonKind names the JSON type a Go type decodes from.
func jsonKind(t reflect.Type) string {
	for t != nil && t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil {
		return "a different type"
	}
	switch t.Kind() {
	case reflect.String:
		return "a string"
	case reflect.Bool:
		return "true or false"
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64, reflect.Float32, reflect.Float64:
		return "a number"
	case reflect.Slice, reflect.Array:
		return "an array"
	case reflect.Map, reflect.Struct:
		return "an object"
	default:
		return "a different type"
	}
}

// BadBody answers a body the decoder refused: 413 too_large over the size
// limit, otherwise 400 bad_request with the decoder's message.
func BadBody(w http.ResponseWriter, err error) {
	BadBodyWith(w, err, "bad_request", err.Error())
}

// BadBodyWith is BadBody with the route's own 400 code and message. err may be
// nil when the body decoded but missed a required field.
func BadBodyWith(w http.ResponseWriter, err error, code, msg string) {
	if errors.Is(err, ErrBodyTooLarge) {
		WriteError(w, http.StatusRequestEntityTooLarge, "too_large", ErrBodyTooLarge.Error())
		return
	}
	WriteError(w, http.StatusBadRequest, code, msg)
}

// ReadOptionalJSON is ReadJSON for a body that may be empty.
func ReadOptionalJSON(r *http.Request, dst any) error {
	if err := ReadJSON(r, dst); err != nil && !errors.Is(err, io.EOF) {
		return err
	}
	return nil
}

// WriteJSON answers v as JSON with status; responses are never cached.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// WriteError answers the JSON error envelope {"error":{"code","message"}}.
func WriteError(w http.ResponseWriter, status int, code, message string) {
	WriteJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}

// WriteErrorWith is WriteError with more fields in the error object (the
// field a message is about, when a quota resets, ...).
func WriteErrorWith(w http.ResponseWriter, status int, code, message string, more map[string]any) {
	e := map[string]any{"code": code, "message": message}
	for k, v := range more {
		e[k] = v
	}
	WriteJSON(w, status, map[string]any{"error": e})
}

// WriteFieldError answers 400 invalid_input naming the field it is about, so
// the editor shows the message beside it.
func WriteFieldError(w http.ResponseWriter, field, msg string) {
	InvalidField(w, field, field+": "+msg)
}

// InvalidField is WriteFieldError with a message that already names the field.
func InvalidField(w http.ResponseWriter, field, msg string) {
	WriteErrorWith(w, http.StatusBadRequest, "invalid_input", msg, map[string]any{"field": field})
}
