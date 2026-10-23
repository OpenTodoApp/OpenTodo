package channels

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/outbound"
	"github.com/pixari/opentodo/internal/webhook"
)

// SendTimeout bounds one request to a channel.
const SendTimeout = 10 * time.Second

// errorExcerpt bounds the part of a failed response kept in the delivery log.
const errorExcerpt = 200

func netResolver() outbound.Resolver { return net.DefaultResolver }

// target is a channel with its secrets, ready to send to.
type target struct {
	id, kind, url, topic string
	token, userKey       string
}

// outcome is one attempt's result.
type outcome struct {
	ok       bool
	code     int
	errMsg   string
	terminal bool // never retried: refused by policy or missing settings
}

// Webhook payload version (design D3).
const PayloadVersion = 1

// webhookPayload is the documented body a webhook channel receives.
type webhookPayload struct {
	Version   int         `json:"version"`
	ID        string      `json:"id"`
	Event     string      `json:"event"`
	CreatedAt int64       `json:"createdAt"`
	Title     string      `json:"title"`
	Message   string      `json:"message"`
	Body      string      `json:"body"`
	URL       string      `json:"url,omitempty"`
	Task      *payloadRef `json:"task,omitempty"`
	Actor     *payloadRef `json:"actor,omitempty"`
	Page      *payloadRef `json:"page,omitempty"`
}

type payloadRef struct {
	ID    string `json:"id,omitempty"`
	Title string `json:"title,omitempty"`
	Name  string `json:"name,omitempty"`
}

// WebhookBody builds a webhook channel's JSON for one message (exported for docs tests).
func WebhookBody(deliveryID string, m Message) []byte {
	p := webhookPayload{Version: PayloadVersion, ID: deliveryID, Event: m.Event, CreatedAt: m.CreatedAt,
		Title: m.Title, Message: m.Body, Body: m.Body, URL: m.URL}
	if m.TaskID != "" {
		p.Task = &payloadRef{ID: m.TaskID, Title: m.TaskTitle}
	}
	if m.ActorName != "" {
		p.Actor = &payloadRef{Name: m.ActorName}
	}
	if m.PageID != "" {
		p.Page = &payloadRef{ID: m.PageID}
	}
	b, _ := json.Marshal(p)
	return b
}

// priority maps an event to the services' priority scale: reminders stand out.
func priority(event string) (ntfy, pushover, gotify int) {
	if event == EventReminder {
		return 4, 1, 7
	}
	return 3, 0, 5
}

// request builds the HTTP request for one message on one target.
func (s *Service) request(ctx context.Context, t target, deliveryID string, m Message) (*http.Request, error) {
	nP, pP, gP := priority(m.Event)
	var (
		method = http.MethodPost
		addr   string
		body   []byte
		ctype  = "application/json"
	)
	switch t.kind {
	case KindNtfy:
		addr = t.url
		v := map[string]any{"topic": t.topic, "title": m.Title, "message": m.Body, "priority": nP, "tags": []string{"opentodo"}}
		if m.URL != "" {
			v["click"] = m.URL
		}
		body, _ = json.Marshal(v)
	case KindPushover:
		addr, ctype = s.pushoverURL, "application/x-www-form-urlencoded"
		f := url.Values{"token": {t.token}, "user": {t.userKey}, "title": {m.Title}, "message": {m.Body}, "priority": {fmt.Sprint(pP)}}
		if m.URL != "" {
			f.Set("url", m.URL)
			f.Set("url_title", "OpenTodo")
		}
		body = []byte(f.Encode())
	case KindGotify:
		addr = t.url + "/message"
		v := map[string]any{"title": m.Title, "message": m.Body, "priority": gP}
		if m.URL != "" {
			v["extras"] = map[string]any{"client::notification": map[string]any{"click": map[string]string{"url": m.URL}}}
		}
		body, _ = json.Marshal(v)
	case KindWebhook:
		addr, body = t.url, WebhookBody(deliveryID, m)
	default:
		return nil, fmt.Errorf("unknown kind %q", t.kind)
	}
	req, err := http.NewRequestWithContext(ctx, method, addr, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", ctype)
	req.Header.Set("User-Agent", "OpenTodo/"+s.version)
	switch t.kind {
	case KindNtfy:
		if t.token != "" {
			req.Header.Set("Authorization", "Bearer "+t.token)
		}
	case KindGotify:
		req.Header.Set("X-Gotify-Key", t.token)
	case KindWebhook:
		webhook.SetHeaders(req.Header, s.version, "notification."+m.Event, deliveryID, t.id, t.token, s.now().Unix(), body)
	}
	return req, nil
}

// send performs one attempt. Secrets never reach the outcome.
func (s *Service) send(ctx context.Context, t target, deliveryID string, m Message) outcome {
	if t.token == "" && t.kind != KindNtfy || t.kind == KindPushover && t.userKey == "" {
		return outcome{errMsg: "token_missing", terminal: true}
	}
	if t.kind != KindPushover {
		if _, err := outbound.ValidateURL(t.url); err != nil {
			return outcome{errMsg: "invalid_url", terminal: true}
		}
	}
	ctx, cancel := context.WithTimeout(ctx, SendTimeout)
	defer cancel()
	req, err := s.request(ctx, t, deliveryID, m)
	if err != nil {
		return outcome{errMsg: "invalid_url", terminal: true}
	}
	resp, err := s.client.Do(req)
	if err != nil {
		switch {
		case errors.Is(err, outbound.ErrPrivateTarget):
			return outcome{errMsg: "private_target", terminal: true}
		case errors.Is(err, context.DeadlineExceeded) || isTimeout(err):
			return outcome{errMsg: "timeout"}
		default:
			return outcome{errMsg: "connection failed: " + scrub(rootCause(err), t)}
		}
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10))
		return outcome{ok: true, code: resp.StatusCode}
	}
	excerpt, _ := io.ReadAll(io.LimitReader(resp.Body, errorExcerpt))
	msg := fmt.Sprintf("HTTP %d", resp.StatusCode)
	if e := strings.Join(strings.Fields(strings.ToValidUTF8(string(excerpt), "")), " "); e != "" {
		msg += ": " + scrub(e, t)
	}
	// A refused credential will not fix itself on a retry, but a later edit
	// may: retry like any failure so a fixed token picks the message up.
	return outcome{code: resp.StatusCode, errMsg: msg}
}

// scrub removes the target's secrets from a message that may be logged.
func scrub(msg string, t target) string {
	for _, secret := range []string{t.token, t.userKey} {
		if secret != "" {
			msg = strings.ReplaceAll(msg, secret, "[redacted]")
		}
	}
	return msg
}

func isTimeout(err error) bool {
	var ne net.Error
	return errors.As(err, &ne) && ne.Timeout()
}

func rootCause(err error) string {
	for {
		u := errors.Unwrap(err)
		if u == nil {
			return err.Error()
		}
		err = u
	}
}
