// Package stt connects the server to one speech-to-text service (OpenSpec
// change settings-refresh, design D7): any endpoint that implements the
// OpenAI-compatible POST /v1/audio/transcriptions request (Speaches, the
// whisper.cpp server, LocalAI, hosted services). The owner configures it in
// Settings or with OPENTODO_STT_*; the key lives in <data>/secrets/stt.json.
// Audio and text pass through memory only: nothing here writes them anywhere
// or logs them.
package stt

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"strings"
	"time"

	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/outbound"
	"github.com/pixari/opentodo/internal/settings"
)

const (
	// SettingKey is the owner setting holding the URL and model.
	SettingKey = "stt"
	// MaxAudioBytes caps one phrase; MaxSeconds is what the client records at most.
	MaxAudioBytes = 5 << 20
	MaxSeconds    = 60
	// Timeout bounds one request to the service.
	Timeout = 30 * time.Second
	keyName = "key"
)

// AudioTypes are the accepted phrase types (without parameters).
var AudioTypes = map[string]string{"audio/webm": "phrase.webm", "audio/ogg": "phrase.ogg", "audio/mp4": "phrase.m4a", "audio/wav": "phrase.wav", "audio/x-wav": "phrase.wav"}

var (
	// ErrNotConfigured: no service URL and model.
	ErrNotConfigured = errors.New("no speech-to-text service is connected")
	// ErrUnavailable: the service failed, refused or timed out.
	ErrUnavailable = errors.New("the speech service did not answer")
)

// Settings is the stored, non-secret part of the configuration.
type Settings struct {
	URL   string `json:"url"`
	Model string `json:"model"`
}

// View is what the owner's card shows: never the key, only whether one is set,
// and which fields a variable fixes.
type View struct {
	URL       string   `json:"url"`
	Model     string   `json:"model"`
	KeySet    bool     `json:"keySet"`
	Locked    []string `json:"locked"`
	Connected bool     `json:"connected"`
	// Host is the service's host, named to users in the recogniser statement.
	Host string `json:"host,omitempty"`
}

// Service reads the configuration and talks to the speech service.
type Service struct {
	store   *settings.Store
	secrets *settings.SecretsFile
	env     config.STTConfig
	client  *http.Client
}

// New builds the service; allowPrivate is the owner's private-network switch.
func New(store *settings.Store, dataDir string, env config.STTConfig, allowPrivate func(context.Context) bool) *Service {
	d := &outbound.Dialer{AllowPrivate: allowPrivate}
	return &Service{store: store, secrets: settings.NewSecretsFile(dataDir, "stt"), env: env, client: outbound.NewClient(d, Timeout)}
}

// SetClient replaces the HTTP client (tests).
func (s *Service) SetClient(c *http.Client) { s.client = c }

type resolved struct {
	url, model, key string
}

func (s *Service) resolve(ctx context.Context) (resolved, error) {
	var st Settings
	if _, err := s.store.Get(ctx, SettingKey, &st); err != nil {
		return resolved{}, err
	}
	r := resolved{url: st.URL, model: st.Model}
	if s.env.URL != "" {
		r.url = s.env.URL
	}
	if s.env.Model != "" {
		r.model = s.env.Model
	}
	if s.env.KeyFromEnv {
		r.key = s.env.Key
	} else {
		sec, err := s.secrets.Load()
		if err != nil {
			return resolved{}, err
		}
		r.key = sec.Value(keyName)
	}
	return r, nil
}

// View returns the owner's view of the configuration.
func (s *Service) View(ctx context.Context) (View, error) {
	r, err := s.resolve(ctx)
	if err != nil {
		return View{}, err
	}
	v := View{URL: r.url, Model: r.model, KeySet: r.key != "", Locked: []string{}, Connected: r.url != "" && r.model != ""}
	if s.env.URL != "" {
		v.Locked = append(v.Locked, "url")
	}
	if s.env.Model != "" {
		v.Locked = append(v.Locked, "model")
	}
	if s.env.KeyFromEnv {
		v.Locked = append(v.Locked, "key")
	}
	if u, err := url.Parse(r.url); err == nil && v.Connected {
		v.Host = u.Host
	}
	return v, nil
}

// Input is a change from the owner's card: nil keeps a field, an empty key removes it.
type Input struct {
	URL   *string `json:"url"`
	Model *string `json:"model"`
	Key   *string `json:"key"`
}

// FieldError names the field a change was refused for.
type FieldError struct{ Field, Message string }

func (e *FieldError) Error() string { return e.Field + ": " + e.Message }

// Update validates and stores a change; fields fixed by a variable are refused.
func (s *Service) Update(ctx context.Context, in Input) error {
	var st Settings
	if _, err := s.store.Get(ctx, SettingKey, &st); err != nil {
		return err
	}
	locked := func(f string, set bool) bool { return set && ((f == "url" && s.env.URL != "") || (f == "model" && s.env.Model != "") || (f == "key" && s.env.KeyFromEnv)) }
	for f, set := range map[string]bool{"url": in.URL != nil, "model": in.Model != nil, "key": in.Key != nil} {
		if locked(f, set) {
			return &FieldError{f, "set by a variable on the server"}
		}
	}
	if in.URL != nil {
		raw := strings.TrimRight(strings.TrimSpace(*in.URL), "/")
		if raw != "" {
			if _, err := outbound.ValidateURL(raw); err != nil {
				return &FieldError{"url", "enter an http or https address"}
			}
		}
		st.URL = raw
	}
	if in.Model != nil {
		m := strings.TrimSpace(*in.Model)
		if m == "" && st.URL != "" {
			return &FieldError{"model", "enter the model the service should use"}
		}
		if len(m) > 200 {
			return &FieldError{"model", "at most 200 characters"}
		}
		st.Model = m
	}
	if in.Key != nil {
		k := strings.TrimSpace(*in.Key)
		if err := s.secrets.Update(map[string]*string{keyName: &k}); err != nil {
			return err
		}
	}
	return s.store.Set(ctx, SettingKey, st)
}

// Transcribe sends one phrase to the service and returns its text. language is
// an optional ISO 639-1 code.
func (s *Service) Transcribe(ctx context.Context, audio []byte, contentType, language string) (string, error) {
	r, err := s.resolve(ctx)
	if err != nil {
		return "", err
	}
	if r.url == "" || r.model == "" {
		return "", ErrNotConfigured
	}
	return s.send(ctx, r, audio, contentType, language)
}

func (s *Service) send(ctx context.Context, r resolved, audio []byte, contentType, language string) (string, error) {
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	h := textproto.MIMEHeader{}
	h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="file"; filename=%q`, AudioTypes[contentType]))
	h.Set("Content-Type", contentType)
	part, err := mw.CreatePart(h)
	if err != nil {
		return "", err
	}
	if _, err := part.Write(audio); err != nil {
		return "", err
	}
	fields := [][2]string{{"model", r.model}, {"response_format", "json"}}
	if language != "" {
		fields = append(fields, [2]string{"language", language})
	}
	for _, f := range fields {
		if err := mw.WriteField(f[0], f[1]); err != nil {
			return "", err
		}
	}
	if err := mw.Close(); err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(ctx, Timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.url+"/v1/audio/transcriptions", &body)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if r.key != "" {
		req.Header.Set("Authorization", "Bearer "+r.key)
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("%w: %s", ErrUnavailable, stage(err))
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("%w: reading the answer", ErrUnavailable)
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("%w: the service answered %d", ErrUnavailable, resp.StatusCode)
	}
	var out struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", fmt.Errorf("%w: the answer is not JSON with a text", ErrUnavailable)
	}
	return strings.TrimSpace(out.Text), nil
}

// stage names where a request failed, without the address or any content.
func stage(err error) string {
	switch {
	case errors.Is(err, outbound.ErrPrivateTarget):
		return "the address is on a private network; allow private network targets in Settings → Server"
	case errors.Is(err, context.DeadlineExceeded):
		return "no answer within 30 seconds"
	case strings.Contains(err.Error(), "resolve"):
		return "the host name could not be resolved"
	default:
		return "the connection failed"
	}
}

// Test sends a built-in one-second sample (silence) with the stored or the
// given draft settings, so the owner can try a URL before saving it.
func (s *Service) Test(ctx context.Context, draft Input) (string, error) {
	r, err := s.resolve(ctx)
	if err != nil {
		return "", err
	}
	if draft.URL != nil && s.env.URL == "" {
		if _, err := outbound.ValidateURL(strings.TrimSpace(*draft.URL)); err != nil {
			return "", &FieldError{"url", "enter an http or https address"}
		}
		r.url = strings.TrimRight(strings.TrimSpace(*draft.URL), "/")
	}
	if draft.Model != nil && s.env.Model == "" {
		r.model = strings.TrimSpace(*draft.Model)
	}
	if draft.Key != nil && *draft.Key != "" && !s.env.KeyFromEnv {
		r.key = strings.TrimSpace(*draft.Key)
	}
	if r.url == "" || r.model == "" {
		return "", ErrNotConfigured
	}
	return s.send(ctx, r, SampleWAV(), "audio/wav", "en")
}

// SampleWAV is one second of 16 kHz mono silence, the Test's built-in phrase.
func SampleWAV() []byte {
	const rate, samples = 16000, 16000
	var b bytes.Buffer
	data := samples * 2
	b.WriteString("RIFF")
	_ = binary.Write(&b, binary.LittleEndian, uint32(36+data))
	b.WriteString("WAVEfmt ")
	for _, v := range []any{uint32(16), uint16(1), uint16(1), uint32(rate), uint32(rate * 2), uint16(2), uint16(16)} {
		_ = binary.Write(&b, binary.LittleEndian, v)
	}
	b.WriteString("data")
	_ = binary.Write(&b, binary.LittleEndian, uint32(data))
	b.Write(make([]byte, data))
	return b.Bytes()
}
