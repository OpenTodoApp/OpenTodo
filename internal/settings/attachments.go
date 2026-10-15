package settings

import (
	"context"
	"fmt"
)

// Attachment settings (OpenSpec change attachments, design D5): read per request,
// so the owner's changes apply without a restart.
const (
	AttachmentsEnabledKey = "attachments.enabled"
	AttachmentsMaxFileKey = "attachments.max_file_mb"
	AttachmentsQuotaKey   = "attachments.quota_mb"

	DefaultAttachmentMaxFileMB = 25
	DefaultAttachmentQuotaMB   = 1024
	MinAttachmentMaxFileMB     = 1
	MaxAttachmentMaxFileMB     = 2048
	// MaxAttachmentQuotaMB caps the per-account quota (1 TB); 0 means unlimited.
	MaxAttachmentQuotaMB = 1 << 20
)

// Attachments is the owner's attachment configuration.
type Attachments struct {
	Enabled   bool `json:"enabled"`
	MaxFileMB int  `json:"max_file_mb"`
	// QuotaMB is the per-account total; 0 means unlimited.
	QuotaMB int `json:"quota_mb"`
}

// DefaultAttachments is used for every key that was never set.
func DefaultAttachments() Attachments {
	return Attachments{Enabled: true, MaxFileMB: DefaultAttachmentMaxFileMB, QuotaMB: DefaultAttachmentQuotaMB}
}

// Validate checks the bounds and returns a user-facing message.
func (a Attachments) Validate() error {
	if a.MaxFileMB < MinAttachmentMaxFileMB || a.MaxFileMB > MaxAttachmentMaxFileMB {
		return fmt.Errorf("max_file_mb must be between %d and %d", MinAttachmentMaxFileMB, MaxAttachmentMaxFileMB)
	}
	if a.QuotaMB < 0 || a.QuotaMB > MaxAttachmentQuotaMB {
		return fmt.Errorf("quota_mb must be between 0 (unlimited) and %d", MaxAttachmentQuotaMB)
	}
	return nil
}

// MaxFileBytes is the per-file limit in bytes.
func (a Attachments) MaxFileBytes() int64 { return int64(a.MaxFileMB) << 20 }

// QuotaBytes is the per-account quota in bytes; 0 means unlimited.
func (a Attachments) QuotaBytes() int64 { return int64(a.QuotaMB) << 20 }

// Attachments reads the settings, defaults filling keys that were never set.
func (s *Store) Attachments(ctx context.Context) (Attachments, error) {
	a := DefaultAttachments()
	if _, err := s.Get(ctx, AttachmentsEnabledKey, &a.Enabled); err != nil {
		return a, err
	}
	if _, err := s.Get(ctx, AttachmentsMaxFileKey, &a.MaxFileMB); err != nil {
		return a, err
	}
	if _, err := s.Get(ctx, AttachmentsQuotaKey, &a.QuotaMB); err != nil {
		return a, err
	}
	return a, nil
}

// SetAttachments validates and stores the settings.
func (s *Store) SetAttachments(ctx context.Context, a Attachments) error {
	if err := a.Validate(); err != nil {
		return err
	}
	if err := s.Set(ctx, AttachmentsEnabledKey, a.Enabled); err != nil {
		return err
	}
	if err := s.Set(ctx, AttachmentsMaxFileKey, a.MaxFileMB); err != nil {
		return err
	}
	return s.Set(ctx, AttachmentsQuotaKey, a.QuotaMB)
}

// SeedAttachments applies the optional OPENTODO_ATTACHMENTS_* presets once: each
// key is written only when it does not exist yet, so the owner's later choices
// in Settings are authoritative. Values are validated by the config loader.
func (s *Store) SeedAttachments(ctx context.Context, maxFileMB, quotaMB *int) error {
	seed := func(key string, v *int) error {
		if v == nil {
			return nil
		}
		var cur int
		ok, err := s.Get(ctx, key, &cur)
		if err != nil || ok {
			return err
		}
		return s.Set(ctx, key, *v)
	}
	if err := seed(AttachmentsMaxFileKey, maxFileMB); err != nil {
		return err
	}
	return seed(AttachmentsQuotaKey, quotaMB)
}
