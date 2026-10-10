package config

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// BackupPreset carries the optional OPENTODO_BACKUP_* variables. They seed the
// backup settings once, on a start where no backup settings exist yet; after
// that the owner's choices in Settings are authoritative. Every field is
// optional: Present is false when no variable was set at all.
type BackupPreset struct {
	Present bool

	Destination string // local | s3 | webdav
	LocalDir    string

	S3Endpoint  string
	S3Region    string
	S3Bucket    string
	S3Prefix    string
	S3AccessKey string
	S3SecretKey string
	S3PathStyle *bool

	WebDAVURL       string
	WebDAVUsername  string
	WebDAVPassword  string
	WebDAVAllowHTTP *bool

	Schedule   string // off | hourly | daily | weekly
	Time       string // HH:MM
	Weekday    *int   // 0 = Sunday … 6 = Saturday
	KeepLast   *int
	MaxAgeDays *int
	Compress   *bool
	Passphrase string
}

var weekdays = map[string]int{"sun": 0, "mon": 1, "tue": 2, "wed": 3, "thu": 4, "fri": 5, "sat": 6}

// loadBackupPreset parses OPENTODO_BACKUP_*; an invalid value is an error that
// names the variable so startup stops with a clear message.
func loadBackupPreset() (BackupPreset, error) {
	var p BackupPreset
	str := func(name string) string {
		v, ok := os.LookupEnv(name)
		v = strings.TrimSpace(v)
		if ok && v != "" {
			p.Present = true
		}
		return v
	}
	boolean := func(name string) (*bool, error) {
		v := str(name)
		if v == "" {
			return nil, nil
		}
		b, err := strconv.ParseBool(v)
		if err != nil {
			return nil, fmt.Errorf("%s must be true or false, got %q", name, v)
		}
		return &b, nil
	}
	integer := func(name string, min int) (*int, error) {
		v := str(name)
		if v == "" {
			return nil, nil
		}
		n, err := strconv.Atoi(v)
		if err != nil || n < min {
			return nil, fmt.Errorf("%s must be an integer of at least %d, got %q", name, min, v)
		}
		return &n, nil
	}
	var err error

	p.Destination = strings.ToLower(str("OPENTODO_BACKUP_DESTINATION"))
	switch p.Destination {
	case "", "local", "s3", "webdav":
	default:
		return p, fmt.Errorf("OPENTODO_BACKUP_DESTINATION must be local, s3 or webdav, got %q", p.Destination)
	}
	if p.LocalDir = str("OPENTODO_BACKUP_LOCAL_DIR"); p.LocalDir != "" && !filepath.IsAbs(p.LocalDir) {
		return p, fmt.Errorf("OPENTODO_BACKUP_LOCAL_DIR must be an absolute path, got %q", p.LocalDir)
	}
	if p.S3Endpoint = str("OPENTODO_BACKUP_S3_ENDPOINT"); p.S3Endpoint != "" {
		if u, err := url.Parse(p.S3Endpoint); err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
			return p, fmt.Errorf("OPENTODO_BACKUP_S3_ENDPOINT must be an http(s) URL, got %q", p.S3Endpoint)
		}
	}
	p.S3Region = str("OPENTODO_BACKUP_S3_REGION")
	p.S3Bucket = str("OPENTODO_BACKUP_S3_BUCKET")
	p.S3Prefix = str("OPENTODO_BACKUP_S3_PREFIX")
	p.S3AccessKey = str("OPENTODO_BACKUP_S3_ACCESS_KEY")
	p.S3SecretKey = str("OPENTODO_BACKUP_S3_SECRET_KEY")
	if p.S3PathStyle, err = boolean("OPENTODO_BACKUP_S3_PATH_STYLE"); err != nil {
		return p, err
	}
	if p.WebDAVURL = str("OPENTODO_BACKUP_WEBDAV_URL"); p.WebDAVURL != "" {
		if u, err := url.Parse(p.WebDAVURL); err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
			return p, fmt.Errorf("OPENTODO_BACKUP_WEBDAV_URL must be an http(s) URL, got %q", p.WebDAVURL)
		}
	}
	p.WebDAVUsername = str("OPENTODO_BACKUP_WEBDAV_USERNAME")
	p.WebDAVPassword = str("OPENTODO_BACKUP_WEBDAV_PASSWORD")
	if p.WebDAVAllowHTTP, err = boolean("OPENTODO_BACKUP_WEBDAV_ALLOW_HTTP"); err != nil {
		return p, err
	}

	p.Schedule = strings.ToLower(str("OPENTODO_BACKUP_SCHEDULE"))
	switch p.Schedule {
	case "", "off", "hourly", "daily", "weekly":
	default:
		return p, fmt.Errorf("OPENTODO_BACKUP_SCHEDULE must be off, hourly, daily or weekly, got %q", p.Schedule)
	}
	if p.Time = str("OPENTODO_BACKUP_TIME"); p.Time != "" && !ValidClock(p.Time) {
		return p, fmt.Errorf("OPENTODO_BACKUP_TIME must be HH:MM (24-hour), got %q", p.Time)
	}
	if v := strings.ToLower(str("OPENTODO_BACKUP_WEEKDAY")); v != "" {
		d, ok := weekdays[v[:min(3, len(v))]]
		if n, err := strconv.Atoi(v); err == nil {
			d, ok = n, n >= 0 && n <= 6
		}
		if !ok {
			return p, fmt.Errorf("OPENTODO_BACKUP_WEEKDAY must be 0-6 (0 = Sunday) or a day name, got %q", v)
		}
		p.Weekday = &d
	}
	if p.KeepLast, err = integer("OPENTODO_BACKUP_KEEP", 1); err != nil {
		return p, err
	}
	if p.MaxAgeDays, err = integer("OPENTODO_BACKUP_MAX_AGE_DAYS", 0); err != nil {
		return p, err
	}
	if p.Compress, err = boolean("OPENTODO_BACKUP_COMPRESS"); err != nil {
		return p, err
	}
	p.Passphrase = str("OPENTODO_BACKUP_PASSPHRASE")
	if f := str("OPENTODO_BACKUP_PASSPHRASE_FILE"); f != "" {
		raw, err := os.ReadFile(f)
		if err != nil {
			return p, fmt.Errorf("OPENTODO_BACKUP_PASSPHRASE_FILE: %w", err)
		}
		p.Passphrase = strings.TrimRight(string(raw), "\r\n")
		if p.Passphrase == "" {
			return p, fmt.Errorf("OPENTODO_BACKUP_PASSPHRASE_FILE: file %s is empty", f)
		}
	}
	return p, nil
}

// ValidClock reports whether s is a 24-hour HH:MM time.
func ValidClock(s string) bool {
	if len(s) != 5 || s[2] != ':' {
		return false
	}
	h, err1 := strconv.Atoi(s[:2])
	m, err2 := strconv.Atoi(s[3:])
	return err1 == nil && err2 == nil && h >= 0 && h < 24 && m >= 0 && m < 60
}
