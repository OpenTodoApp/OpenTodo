package audit

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"
)

// Settings keys in the shared `settings` table and their bounds (design D4, D5).
const (
	KeyRetentionDays     = "audit.retention_days"
	KeyLogIP             = "audit.log_ip"
	DefaultRetentionDays = 90
	MinRetentionDays     = 7
	MaxRetentionDays     = 3650
)

// ErrInvalidRetention is returned for a retention outside 7–3650 days.
var ErrInvalidRetention = errors.New("retentionDays must be between 7 and 3650")

// Settings is the owner-controlled audit configuration. It is server
// configuration and is never synced to devices.
type Settings struct {
	RetentionDays int  `json:"retentionDays"`
	LogIP         bool `json:"logIp"`
}

// SettingsPatch carries the fields to change; nil fields are left as they are.
type SettingsPatch struct {
	RetentionDays *int  `json:"retentionDays"`
	LogIP         *bool `json:"logIp"`
}

func loadSettings(ctx context.Context, q execer) (Settings, error) {
	s := Settings{RetentionDays: DefaultRetentionDays}
	v, err := readSetting(ctx, q, KeyRetentionDays)
	if err != nil {
		return s, err
	}
	if n, err := strconv.Atoi(v); err == nil && n >= MinRetentionDays && n <= MaxRetentionDays {
		s.RetentionDays = n
	}
	v, err = readSetting(ctx, q, KeyLogIP)
	if err != nil {
		return s, err
	}
	s.LogIP = v == "true"
	return s, nil
}

func readSetting(ctx context.Context, q execer, key string) (string, error) {
	var v string
	err := q.QueryRowContext(ctx, "SELECT value FROM settings WHERE key = ?", key).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return v, err
}

func writeSetting(ctx context.Context, q execer, key, value string) error {
	_, err := q.ExecContext(ctx, "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value)
	return err
}

// Settings returns the current audit settings with defaults applied.
func (r *Recorder) Settings(ctx context.Context) (Settings, error) {
	return loadSettings(ctx, r.db)
}

// UpdateSettings applies p for actorID in one transaction: every changed value is
// written together with its settings.changed event, and turning address logging
// off scrubs every stored address in the same transaction so the owner's choice
// is immediate and complete.
func (r *Recorder) UpdateSettings(ctx context.Context, actorID string, p SettingsPatch) (Settings, error) {
	if p.RetentionDays != nil && (*p.RetentionDays < MinRetentionDays || *p.RetentionDays > MaxRetentionDays) {
		return Settings{}, ErrInvalidRetention
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return Settings{}, err
	}
	defer tx.Rollback()
	cur, err := loadSettings(ctx, tx)
	if err != nil {
		return Settings{}, err
	}
	next := cur
	if p.RetentionDays != nil && *p.RetentionDays != cur.RetentionDays {
		next.RetentionDays = *p.RetentionDays
		if err := writeSetting(ctx, tx, KeyRetentionDays, strconv.Itoa(next.RetentionDays)); err != nil {
			return Settings{}, err
		}
		if err := r.RecordTx(ctx, tx, SettingsChanged(actorID, KeyRetentionDays, strconv.Itoa(cur.RetentionDays), strconv.Itoa(next.RetentionDays))); err != nil {
			return Settings{}, err
		}
	}
	if p.LogIP != nil && *p.LogIP != cur.LogIP {
		next.LogIP = *p.LogIP
		if err := writeSetting(ctx, tx, KeyLogIP, strconv.FormatBool(next.LogIP)); err != nil {
			return Settings{}, err
		}
		if !next.LogIP {
			if _, err := tx.ExecContext(ctx, "UPDATE audit_events SET ip = NULL WHERE ip IS NOT NULL"); err != nil {
				return Settings{}, fmt.Errorf("audit: scrub addresses: %w", err)
			}
		}
		if err := r.RecordTx(ctx, tx, SettingsChanged(actorID, KeyLogIP, strconv.FormatBool(cur.LogIP), strconv.FormatBool(next.LogIP))); err != nil {
			return Settings{}, err
		}
	}
	return next, tx.Commit()
}
