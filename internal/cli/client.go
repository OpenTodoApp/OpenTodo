package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/origin"
)

// Exit codes form the contract scripts rely on.
const (
	ExitOK          = 0
	ExitServer      = 1 // the server answered with an error
	ExitUsage       = 2 // bad arguments or local validation
	ExitAuth        = 3 // authentication or configuration problem
	ExitUnreachable = 4 // the server could not be reached
	// ExitNotPermitted: refused by scope, role, a switch, encryption or
	// read-only mode. Retrying cannot help (agent-ready-cli D2).
	ExitNotPermitted = 5
)

// notPermittedCodes are the envelope codes that exit with ExitNotPermitted.
var notPermittedCodes = map[string]bool{
	"insufficient_scope": true, "forbidden": true, "not_permitted": true,
	"writes_disabled_by_owner": true, "writes_disabled_by_user": true,
	"read_only": true, "encryption_enabled": true, "issues_disabled": true,
}

// exitError carries an exit code and, optionally, the exact JSON envelope to print
// in --json mode. Local errors synthesise an envelope with a stable code.
type exitError struct {
	code     int
	jsonCode string
	msg      string
	envelope []byte // raw server envelope when the server produced one
}

func (e *exitError) Error() string { return e.msg }

// Envelope returns the JSON to print on stdout in --json mode: the server's
// envelope as it came, or a synthesised one, with the additive field exit
// (the process exit code) inside error.
func (e *exitError) Envelope() []byte {
	if len(e.envelope) > 0 {
		var env map[string]any
		if json.Unmarshal(e.envelope, &env) == nil {
			if inner, ok := env["error"].(map[string]any); ok {
				inner["exit"] = e.code
				return encodeCompact(env)
			}
		}
	}
	code := e.jsonCode
	if code == "" {
		switch e.code {
		case ExitUsage:
			code = "usage"
		case ExitAuth:
			code = "auth"
		case ExitUnreachable:
			code = "unreachable"
		default:
			code = "error"
		}
	}
	return encodeCompact(map[string]any{"error": map[string]any{"code": code, "message": e.msg, "exit": e.code}})
}

func encodeCompact(v any) []byte {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
	return bytes.TrimSpace(buf.Bytes())
}

func usageErr(format string, a ...any) error {
	return &exitError{code: ExitUsage, msg: fmt.Sprintf(format, a...)}
}

func authErr(format string, a ...any) error {
	return &exitError{code: ExitAuth, msg: fmt.Sprintf(format, a...)}
}

func serverErr(format string, a ...any) error {
	return &exitError{code: ExitServer, msg: fmt.Sprintf(format, a...)}
}

// apiError is what the server returned: the status, the decoded envelope and the raw body.
type apiError struct {
	Status  int
	Code    string
	Message string
	Raw     []byte
}

func (e *apiError) Error() string {
	if e.Message != "" {
		return e.Message
	}
	return fmt.Sprintf("server returned HTTP %d", e.Status)
}

const defaultTimeout = 15 * time.Second

// client is a thin bearer-token HTTP client for /api/v1.
type client struct {
	base  string
	token string
	http  *http.Client
	// cookie is set only during login, when the client acts with a session.
	cookie *http.Cookie
	// gate is shared by every client of one run: read-only mode, dry run and
	// the token scope (gate.go). nil for the login client.
	gate *writeGate
}

func newClient(base, token string) *client {
	return &client{base: base, token: token, http: &http.Client{Timeout: defaultTimeout, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}

// do performs one request. body is JSON-encoded when non-nil. On 2xx the response
// body is returned raw. Errors are already mapped to exit codes.
func (c *client) do(ctx context.Context, method, path string, body any, headers map[string]string) ([]byte, int, error) {
	if method != http.MethodGet && c.gate != nil {
		if planned, err := c.gate.beforeWrite(ctx, c, method, path, body, headers); err != nil || planned != nil {
			return planned, http.StatusOK, err
		}
	}
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, 0, err
		}
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.base+"/api/v1"+path, rd)
	if err != nil {
		return nil, 0, usageErr("invalid server URL %q: %v", c.base, err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "ot/"+Version)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	if c.cookie != nil {
		req.AddCookie(c.cookie)
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, 0, c.unreachable(err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
	if err != nil {
		return nil, resp.StatusCode, c.unreachable(err)
	}
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		if path == "/auth/login" {
			for _, ck := range resp.Cookies() {
				if ck.Name == "opentodo_session" {
					c.cookie = ck
				}
			}
		}
		return raw, resp.StatusCode, nil
	}
	return nil, resp.StatusCode, c.mapError(resp.StatusCode, raw)
}

func (c *client) unreachable(err error) error {
	var uerr *url.Error
	msg := err.Error()
	if errors.As(err, &uerr) && uerr.Err != nil {
		msg = uerr.Err.Error()
	}
	return &exitError{code: ExitUnreachable, msg: fmt.Sprintf("cannot reach %s: %s\nCheck that the server is running and that the URL is right.", c.base, msg)}
}

// mapError turns an HTTP error response into an exitError. 401 is an authentication
// problem (3); every other error status is a server-side rejection (1).
func (c *client) mapError(status int, raw []byte) error {
	ae := &apiError{Status: status, Raw: raw}
	var env struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if json.Unmarshal(raw, &env) == nil && env.Error.Code != "" {
		ae.Code, ae.Message = env.Error.Code, env.Error.Message
	} else {
		// Not the API's envelope: most likely a proxy or a wrong URL.
		ae.Message = fmt.Sprintf("server returned HTTP %d from %s (is this an OpenTodo server?)", status, c.base)
		raw = nil
	}
	ee := &exitError{code: ExitServer, jsonCode: ae.Code, msg: ae.Message, envelope: raw}
	if notPermittedCodes[ae.Code] {
		ee.code = ExitNotPermitted
	}
	if status == http.StatusUnauthorized {
		ee.code = ExitAuth
		if ae.Code == "unauthorized" {
			ee.msg = ae.Message + "\nThe stored token was rejected; run `ot login <server-url>` to sign in again."
		}
	}
	if ee.jsonCode == "" {
		ee.jsonCode = "http_" + fmt.Sprint(status)
	}
	return ee
}

// getJSON decodes a 2xx response into dst.
func (c *client) getJSON(ctx context.Context, path string, dst any) error {
	raw, _, err := c.do(ctx, http.MethodGet, path, nil, nil)
	if err != nil {
		return err
	}
	return decodeInto(raw, dst)
}

func (c *client) postJSON(ctx context.Context, path string, body any, dst any) error {
	raw, _, err := c.do(ctx, http.MethodPost, path, body, nil)
	if err != nil {
		return err
	}
	if dst == nil {
		return nil
	}
	return decodeInto(raw, dst)
}

func (c *client) patchJSON(ctx context.Context, path string, body any, dst any) error {
	raw, _, err := c.do(ctx, http.MethodPatch, path, body, nil)
	if err != nil {
		return err
	}
	if dst == nil {
		return nil
	}
	return decodeInto(raw, dst)
}

func (c *client) delete(ctx context.Context, path string) error {
	_, _, err := c.do(ctx, http.MethodDelete, path, nil, nil)
	return err
}

func decodeInto(raw []byte, dst any) error {
	if len(bytes.TrimSpace(raw)) == 0 {
		return nil
	}
	if err := json.Unmarshal(raw, dst); err != nil {
		return serverErr("unexpected response from server: %v", err)
	}
	return nil
}

// ---- API shapes the CLI reads. Raw keeps the untouched entity for --json. ----

type due struct {
	Date string  `json:"date"`
	Time *string `json:"time,omitempty"`
	// TZ makes the due zoned (absolute-datetimes): the wall time in that IANA zone.
	TZ *string `json:"tz,omitempty"`
	// hint is the original wall time and zone of a zoned due shown in another
	// zone (display only, set by inZone).
	hint string
}

type task struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	ProjectID   *string `json:"project_id"`
	// ParentID is the parent task for a subtask; it decides Inbox membership too.
	ParentID *string `json:"parent_id"`
	Priority int     `json:"priority"`
	Due      *due    `json:"due"`
	// Start is a date, "someday" or null (start-dates); it decides Inbox membership.
	Start       *string  `json:"start"`
	// Planning fields (agent-planning-fields): deadline, This Evening, the tasks
	// it waits for and the location as stored.
	Deadline  *string         `json:"deadline"`
	Evening   bool            `json:"evening"`
	BlockedBy []string        `json:"blocked_by"`
	Location  json.RawMessage `json:"location"`
	Labels      []string `json:"labels"`
	Position    float64  `json:"position"`
	CreatedAt   float64  `json:"created_at"`
	CompletedAt *float64 `json:"completed_at"`
	DeletedAt   *float64 `json:"deleted_at"`
	// Origin is null, the object or an encrypted account's ciphertext (task-origin).
	Origin json.RawMessage `json:"origin"`
	Raw    json.RawMessage `json:"-"`
}

// originLabel is the origin's id or host, "" when there is none or it is encrypted.
func (t task) originLabel() string {
	if o, err := origin.Decode(t.Origin); err == nil {
		return o.Label()
	}
	return ""
}

type project struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Color     string          `json:"color"`
	Archived  bool            `json:"archived"`
	Position  float64         `json:"position"`
	CreatedAt float64         `json:"created_at"`
	DeletedAt *float64        `json:"deleted_at"`
	Raw       json.RawMessage `json:"-"`
}

type token struct {
	ID         string          `json:"id"`
	Name       string          `json:"name"`
	Scope      string          `json:"scope"`
	CreatedAt  int64           `json:"createdAt"`
	LastUsedAt *int64          `json:"lastUsedAt"`
	Raw        json.RawMessage `json:"-"`
}

type user struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
	Role  string `json:"role"`
}

func (c *client) tasks(ctx context.Context) ([]task, error) {
	var out struct {
		Tasks []json.RawMessage `json:"tasks"`
	}
	if err := c.getJSON(ctx, "/tasks", &out); err != nil {
		return nil, err
	}
	list := make([]task, 0, len(out.Tasks))
	for _, raw := range out.Tasks {
		var t task
		if err := json.Unmarshal(raw, &t); err != nil {
			return nil, serverErr("unexpected task shape: %v", err)
		}
		t.Raw = raw
		if t.Priority == 0 {
			t.Priority = 4
		}
		list = append(list, t)
	}
	return list, nil
}

func (c *client) projects(ctx context.Context) ([]project, error) {
	var out struct {
		Projects []json.RawMessage `json:"projects"`
	}
	if err := c.getJSON(ctx, "/projects", &out); err != nil {
		return nil, err
	}
	list := make([]project, 0, len(out.Projects))
	for _, raw := range out.Projects {
		var p project
		if err := json.Unmarshal(raw, &p); err != nil {
			return nil, serverErr("unexpected project shape: %v", err)
		}
		p.Raw = raw
		list = append(list, p)
	}
	return list, nil
}

type label struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func (c *client) labels(ctx context.Context) ([]label, error) {
	var out struct {
		Labels []label `json:"labels"`
	}
	if err := c.getJSON(ctx, "/labels", &out); err != nil {
		return nil, err
	}
	return out.Labels, nil
}

// resolveLabels turns `--label` values into label ids, because task.labels holds ids
// (OpenSpec `labels`). A value matches a label id exactly or a label name ignoring
// case; a name that matches nothing creates the label, like the web picker does.
// The result is de-duplicated and keeps the order given.
func (c *client) resolveLabels(ctx context.Context, refs []string) ([]string, error) {
	out := []string{}
	if len(refs) == 0 {
		return out, nil
	}
	existing, err := c.labels(ctx)
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	for _, ref := range refs {
		ref = strings.TrimSpace(ref)
		if ref == "" {
			continue
		}
		id := ""
		for _, l := range existing {
			if l.ID == ref {
				id = l.ID
				break
			}
		}
		if id == "" {
			for _, l := range existing {
				if strings.EqualFold(strings.TrimSpace(l.Name), ref) {
					id = l.ID
					break
				}
			}
		}
		if id == "" {
			var created label
			if err := c.postJSON(ctx, "/labels", map[string]any{"name": ref}, &created); err != nil {
				return nil, err
			}
			existing = append(existing, created)
			id = created.ID
		}
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out, nil
}

func (c *client) tokens(ctx context.Context) ([]token, error) {
	var out struct {
		Tokens []json.RawMessage `json:"tokens"`
	}
	if err := c.getJSON(ctx, "/tokens", &out); err != nil {
		return nil, err
	}
	list := make([]token, 0, len(out.Tokens))
	for _, raw := range out.Tokens {
		var t token
		if err := json.Unmarshal(raw, &t); err != nil {
			return nil, serverErr("unexpected token shape: %v", err)
		}
		t.Raw = raw
		list = append(list, t)
	}
	return list, nil
}

// credential is the additive auth object of GET /api/v1/me (agent-ready-cli
// D7). Servers from before it send none: Scope is then "".
type credential struct {
	Method        string `json:"method"`
	Scope         string `json:"scope"`
	TokenID       string `json:"token_id,omitempty"`
	TokenName     string `json:"token_name,omitempty"`
	WritesAllowed *bool  `json:"writes_allowed,omitempty"`
	WritesDenied  string `json:"writes_denied,omitempty"`
}

func (c *client) me(ctx context.Context) (*user, error) {
	u, _, err := c.meAuth(ctx)
	return u, err
}

// meAuth returns the user and the credential the request used.
func (c *client) meAuth(ctx context.Context) (*user, credential, error) {
	var out struct {
		User *user      `json:"user"`
		Auth credential `json:"auth"`
	}
	if err := c.getJSON(ctx, "/me", &out); err != nil {
		return nil, credential{}, err
	}
	if out.User == nil {
		return nil, credential{}, serverErr("unexpected response from server: missing user")
	}
	return out.User, out.Auth, nil
}

// normalizeURL accepts "todo.example.com", "http://host:8080/" and friends.
func normalizeURL(s string) (string, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", usageErr("server URL is required")
	}
	if !strings.Contains(s, "://") {
		s = "https://" + s
	}
	u, err := url.Parse(s)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
		return "", usageErr("invalid server URL %q (expected http(s)://host[:port])", s)
	}
	u.Path = strings.TrimSuffix(strings.TrimRight(u.Path, "/"), "/api/v1")
	u.RawQuery, u.Fragment = "", ""
	return strings.TrimRight(u.String(), "/"), nil
}
