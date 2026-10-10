package backup

import (
	"context"
	"fmt"
	"net/url"
	"path/filepath"
	"strings"

	"github.com/pixari/opentodo/internal/config"
	"github.com/pixari/opentodo/internal/settings"
)

// SettingsKey is the row in the shared settings table holding the backup settings.
const SettingsKey = "backup"

// Secret names inside <data>/secrets/backup.json.
const (
	SecretS3Key      = "s3_secret_key"
	SecretWebDAVPass = "webdav_password"
	SecretPassphrase = "passphrase"
)

// Destination kinds.
const (
	DestLocal  = "local"
	DestS3     = "s3"
	DestWebDAV = "webdav"
)

// Schedule frequencies.
const (
	FreqOff    = "off"
	FreqHourly = "hourly"
	FreqDaily  = "daily"
	FreqWeekly = "weekly"
)

// Settings are the non-secret backup settings, stored as one JSON value.
type Settings struct {
	Destination string         `json:"destination"`
	Local       LocalSettings  `json:"local"`
	S3          S3Settings     `json:"s3"`
	WebDAV      WebDAVSettings `json:"webdav"`
	Schedule    Schedule       `json:"schedule"`
	Retention   Retention      `json:"retention"`
	Compress    bool           `json:"compress"`
	// ScheduleSince (Unix ms) is when the current schedule was set; a schedule
	// that has never run is due from this moment, not from the beginning of time.
	ScheduleSince int64 `json:"scheduleSince"`
}

// LocalSettings configure the local directory destination.
type LocalSettings struct {
	// Dir is an absolute path; empty means <data>/backups.
	Dir string `json:"dir"`
}

// S3Settings configure an S3-compatible destination. The secret key lives in the
// secrets file.
type S3Settings struct {
	Endpoint  string `json:"endpoint"`
	Region    string `json:"region"`
	Bucket    string `json:"bucket"`
	Prefix    string `json:"prefix"`
	AccessKey string `json:"accessKey"`
	PathStyle bool   `json:"pathStyle"`
}

// WebDAVSettings configure a WebDAV destination. The password lives in the
// secrets file.
type WebDAVSettings struct {
	URL      string `json:"url"`
	Username string `json:"username"`
	// AllowHTTP accepts a plain-http URL after the owner acknowledged the warning.
	AllowHTTP bool `json:"allowHttp"`
}

// Schedule says when automatic backups run, in the server's time zone.
type Schedule struct {
	Frequency string `json:"frequency"` // off | hourly | daily | weekly
	Time      string `json:"time"`      // HH:MM; hourly uses the minutes only
	Weekday   int    `json:"weekday"`   // 0 = Sunday … 6 = Saturday (weekly)
}

// Retention decides which archives are deleted after a successful run.
type Retention struct {
	KeepLast   int `json:"keepLast"`   // at least 1
	MaxAgeDays int `json:"maxAgeDays"` // 0 = no age limit
}

// DefaultSettings: local destination, no schedule, keep 7, gzip on. Nothing runs
// until the owner enables a schedule or presses "Back up now".
func DefaultSettings() Settings {
	return Settings{
		Destination: DestLocal,
		Schedule:    Schedule{Frequency: FreqOff, Time: "03:00", Weekday: 0},
		Retention:   Retention{KeepLast: 7},
		Compress:    true,
	}
}

// Enabled reports whether scheduled backups are on.
func (s Settings) Enabled() bool {
	return s.Schedule.Frequency != FreqOff && s.Schedule.Frequency != ""
}

// FieldError names the invalid setting.
type FieldError struct {
	Field   string
	Message string
}

func (e *FieldError) Error() string { return e.Field + ": " + e.Message }

func fieldErr(field, msg string) error { return &FieldError{Field: field, Message: msg} }

// Validate checks s against the secrets that will be in effect.
func (s *Settings) Validate(sec settings.Secrets) error {
	s.Destination = strings.ToLower(strings.TrimSpace(s.Destination))
	switch s.Destination {
	case DestLocal:
		if s.Local.Dir != "" && !filepath.IsAbs(s.Local.Dir) {
			return fieldErr("local.dir", "must be an absolute path or empty for <data>/backups")
		}
	case DestS3:
		s.S3.Endpoint = strings.TrimRight(strings.TrimSpace(s.S3.Endpoint), "/")
		u, err := url.Parse(s.S3.Endpoint)
		switch {
		case s.S3.Endpoint == "":
			return fieldErr("s3.endpoint", "required")
		case err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "":
			return fieldErr("s3.endpoint", "must be an http(s) URL such as https://s3.eu-central-1.amazonaws.com")
		case u.User != nil:
			return fieldErr("s3.endpoint", "must not contain credentials")
		case strings.TrimSpace(s.S3.Bucket) == "":
			return fieldErr("s3.bucket", "required")
		case strings.TrimSpace(s.S3.AccessKey) == "":
			return fieldErr("s3.accessKey", "required")
		case !sec.Has(SecretS3Key):
			return fieldErr("s3SecretKey", "required")
		}
		s.S3.Bucket = strings.TrimSpace(s.S3.Bucket)
		s.S3.Prefix = strings.Trim(strings.TrimSpace(s.S3.Prefix), "/")
		if s.S3.Region == "" {
			s.S3.Region = "us-east-1"
		}
	case DestWebDAV:
		s.WebDAV.URL = strings.TrimSpace(s.WebDAV.URL)
		u, err := url.Parse(s.WebDAV.URL)
		switch {
		case s.WebDAV.URL == "":
			return fieldErr("webdav.url", "required")
		case err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "":
			return fieldErr("webdav.url", "must be an http(s) URL")
		case u.User != nil:
			return fieldErr("webdav.url", "must not contain credentials; use the username and password fields")
		case u.Scheme == "http" && !s.WebDAV.AllowHTTP:
			return fieldErr("webdav.url", "plain http sends the password unencrypted; use https or set allowHttp")
		}
	default:
		return fieldErr("destination", "must be local, s3 or webdav")
	}
	switch s.Schedule.Frequency {
	case FreqOff, FreqHourly, FreqDaily, FreqWeekly:
	case "":
		s.Schedule.Frequency = FreqOff
	default:
		return fieldErr("schedule.frequency", "must be off, hourly, daily or weekly")
	}
	if s.Schedule.Time == "" {
		s.Schedule.Time = "03:00"
	}
	if !config.ValidClock(s.Schedule.Time) {
		return fieldErr("schedule.time", "must be HH:MM (24-hour)")
	}
	if s.Schedule.Weekday < 0 || s.Schedule.Weekday > 6 {
		return fieldErr("schedule.weekday", "must be 0 (Sunday) to 6 (Saturday)")
	}
	if s.Retention.KeepLast < 1 {
		return fieldErr("retention.keepLast", "must be at least 1")
	}
	if s.Retention.MaxAgeDays < 0 {
		return fieldErr("retention.maxAgeDays", "must be 0 (no limit) or more")
	}
	return nil
}

// LoadSettings returns the stored settings, or the defaults when none exist.
func (s *Service) LoadSettings(ctx context.Context) (Settings, error) {
	cur := DefaultSettings()
	if _, err := s.settings.Get(ctx, SettingsKey, &cur); err != nil {
		return cur, err
	}
	return cur, nil
}

// SecretUpdate carries optional secret changes: nil keeps, "" clears, else sets.
type SecretUpdate struct {
	S3SecretKey    *string `json:"s3SecretKey"`
	WebDAVPassword *string `json:"webdavPassword"`
	Passphrase     *string `json:"passphrase"`
}

func (u SecretUpdate) changes() map[string]*string {
	return map[string]*string{SecretS3Key: u.S3SecretKey, SecretWebDAVPass: u.WebDAVPassword, SecretPassphrase: u.Passphrase}
}

// SaveSettings validates and stores new settings plus secret changes. On a
// validation error nothing is written and the previous settings stay active.
func (s *Service) SaveSettings(ctx context.Context, next Settings, upd SecretUpdate) (Settings, error) {
	prev, err := s.LoadSettings(ctx)
	if err != nil {
		return prev, err
	}
	sec, err := s.secrets.Load()
	if err != nil {
		return prev, err
	}
	effective := settings.Secrets{}
	for k, v := range sec {
		effective[k] = v
	}
	for k, v := range upd.changes() {
		if v == nil {
			continue
		}
		if *v == "" {
			delete(effective, k)
		} else {
			effective[k] = *v
		}
	}
	if err := next.Validate(effective); err != nil {
		return prev, err
	}
	if next.Schedule != prev.Schedule || prev.ScheduleSince == 0 {
		next.ScheduleSince = s.now().UnixMilli()
	} else {
		next.ScheduleSince = prev.ScheduleSince
	}
	if err := s.secrets.Update(upd.changes()); err != nil {
		return prev, err
	}
	if err := s.settings.Set(ctx, SettingsKey, next); err != nil {
		return prev, err
	}
	s.wake()
	return next, nil
}

// SecretFlags reports which secrets are stored, never their values.
type SecretFlags struct {
	HasS3SecretKey    bool `json:"hasS3SecretKey"`
	HasWebDAVPassword bool `json:"hasWebdavPassword"`
	HasPassphrase     bool `json:"hasPassphrase"`
}

// Flags loads the presence flags.
func (s *Service) Flags() (SecretFlags, error) {
	sec, err := s.secrets.Load()
	if err != nil {
		return SecretFlags{}, err
	}
	return SecretFlags{HasS3SecretKey: sec.Has(SecretS3Key), HasWebDAVPassword: sec.Has(SecretWebDAVPass), HasPassphrase: sec.Has(SecretPassphrase)}, nil
}

// ApplyPreset seeds settings and secrets from OPENTODO_BACKUP_* once: only when
// no backup settings have been stored yet. It reports whether it wrote anything.
func (s *Service) ApplyPreset(ctx context.Context, p config.BackupPreset) (bool, error) {
	if !p.Present {
		return false, nil
	}
	var existing Settings
	found, err := s.settings.Get(ctx, SettingsKey, &existing)
	if err != nil || found {
		return false, err
	}
	next := DefaultSettings()
	if p.Destination != "" {
		next.Destination = p.Destination
	}
	next.Local.Dir = p.LocalDir
	next.S3 = S3Settings{Endpoint: p.S3Endpoint, Region: p.S3Region, Bucket: p.S3Bucket, Prefix: p.S3Prefix, AccessKey: p.S3AccessKey}
	if p.S3PathStyle != nil {
		next.S3.PathStyle = *p.S3PathStyle
	}
	next.WebDAV = WebDAVSettings{URL: p.WebDAVURL, Username: p.WebDAVUsername}
	if p.WebDAVAllowHTTP != nil {
		next.WebDAV.AllowHTTP = *p.WebDAVAllowHTTP
	}
	if p.Schedule != "" {
		next.Schedule.Frequency = p.Schedule
	}
	if p.Time != "" {
		next.Schedule.Time = p.Time
	}
	if p.Weekday != nil {
		next.Schedule.Weekday = *p.Weekday
	}
	if p.KeepLast != nil {
		next.Retention.KeepLast = *p.KeepLast
	}
	if p.MaxAgeDays != nil {
		next.Retention.MaxAgeDays = *p.MaxAgeDays
	}
	if p.Compress != nil {
		next.Compress = *p.Compress
	}
	opt := func(v string) *string {
		if v == "" {
			return nil
		}
		return &v
	}
	upd := SecretUpdate{S3SecretKey: opt(p.S3SecretKey), WebDAVPassword: opt(p.WebDAVPassword), Passphrase: opt(p.Passphrase)}
	if _, err := s.SaveSettings(ctx, next, upd); err != nil {
		return false, fmt.Errorf("OPENTODO_BACKUP_* presets: %w", err)
	}
	return true, nil
}
