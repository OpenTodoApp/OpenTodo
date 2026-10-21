package vault

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// HTTPTransport exchanges with a server over `POST /api/v1/sync` with a
// bearer token.
type HTTPTransport struct {
	URL    string // the server's base URL
	Token  string
	Client *http.Client
}

// UnreachableError is a request that got no answer from the server.
type UnreachableError struct {
	URL string
	Err error
}

func (e *UnreachableError) Error() string {
	return fmt.Sprintf("cannot reach %s: %v", e.URL, e.Err)
}

func (e *UnreachableError) Unwrap() error { return e.Err }

// HTTPError is an error answer of the server.
type HTTPError struct {
	Status  int
	Code    string
	Message string
}

func (e *HTTPError) Error() string {
	if e.Message != "" {
		return e.Message
	}
	return fmt.Sprintf("the server answered %d", e.Status)
}

func (h *HTTPTransport) client() *http.Client {
	if h.Client != nil {
		return h.Client
	}
	return &http.Client{Timeout: 60 * time.Second}
}

// Exchange sends one sync request.
func (h *HTTPTransport) Exchange(ctx context.Context, req Request) (Reply, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return Reply{}, err
	}
	r, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(h.URL, "/")+"/api/v1/sync", bytes.NewReader(body))
	if err != nil {
		return Reply{}, err
	}
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Authorization", "Bearer "+h.Token)
	resp, err := h.client().Do(r)
	if err != nil {
		if ctx.Err() != nil {
			return Reply{}, ctx.Err()
		}
		return Reply{}, &UnreachableError{URL: h.URL, Err: err}
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		var env struct {
			Error struct {
				Code    string `json:"code"`
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&env)
		return Reply{}, &HTTPError{Status: resp.StatusCode, Code: env.Error.Code, Message: env.Error.Message}
	}
	var rep Reply
	if err := json.NewDecoder(resp.Body).Decode(&rep); err != nil {
		return Reply{}, &UnreachableError{URL: h.URL, Err: err}
	}
	return rep, nil
}

// Events opens the live channel for a device and sends on wake each time the
// server records ops (`event: ops`). It returns when the stream ends.
func (h *HTTPTransport) Events(ctx context.Context, device string, wake chan<- struct{}) error {
	u := strings.TrimRight(h.URL, "/") + "/api/v1/sync/events?device=" + url.QueryEscape(device)
	r, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	r.Header.Set("Authorization", "Bearer "+h.Token)
	r.Header.Set("Accept", "text/event-stream")
	resp, err := (&http.Client{}).Do(r)
	if err != nil {
		return &UnreachableError{URL: h.URL, Err: err}
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return &HTTPError{Status: resp.StatusCode}
	}
	sc := bufio.NewScanner(resp.Body)
	for sc.Scan() {
		if strings.HasPrefix(sc.Text(), "event: ops") {
			select {
			case wake <- struct{}{}:
			default:
			}
		}
	}
	if err := sc.Err(); err != nil && ctx.Err() == nil {
		return &UnreachableError{URL: h.URL, Err: err}
	}
	return ctx.Err()
}
