package backup

import (
	"context"
	"fmt"
	"io"
	"os"
	"time"
)

// ExportName is the file name an export would get now, for a download's
// Content-Disposition (compressed, not encrypted).
func (s *Service) ExportName(ctx context.Context) (string, error) {
	gen, err := s.generation(ctx)
	if err != nil {
		return "", err
	}
	return ArchiveName(s.now(), gen, true, false), nil
}

// Export writes the whole data directory as one compressed, unencrypted backup
// archive to w: the same format scheduled backups write and `opentodo
// restore` reads (OpenSpec `multi-tenant-host`: a hosted tenant's export and
// owner download). It needs no destination and records nothing; the caller
// audits it. The database is snapshotted first, so writes may continue.
func (s *Service) Export(ctx context.Context, w io.Writer) error {
	snap, err := s.snapshot(ctx)
	if err != nil {
		return err
	}
	defer os.Remove(snap)
	gen, err := s.generation(ctx)
	if err != nil {
		return err
	}
	var schema int
	if err := s.db.QueryRowContext(ctx, "PRAGMA user_version").Scan(&schema); err != nil {
		return err
	}
	attachments, err := attachmentFiles(s.dataDir)
	if err != nil {
		return fmt.Errorf("list attachments: %w", err)
	}
	m := Manifest{Format: ManifestFormat, FormatVersion: ManifestVersion, AppVersion: s.version, SchemaVersion: schema,
		CreatedAt: s.now().UTC().Format(time.RFC3339), Generation: gen}
	if err := writeArchive(w, snap, m, archiveOptions{compress: true, extras: s.extraFiles(), attachments: attachments}); err != nil {
		return fmt.Errorf("write archive: %w", err)
	}
	return nil
}

// RunIfDue performs a scheduled backup when one is due: one pass of the
// scheduler, for a host's shared scheduler (OpenSpec `multi-tenant-host` D3),
// which marks runs a previous process left "running" as interrupted first.
func (s *Service) RunIfDue(ctx context.Context) {
	if err := s.markInterrupted(context.WithoutCancel(ctx)); err != nil {
		s.log.Error("backup: mark interrupted runs", "err", err)
	}
	s.runIfDue(ctx)
}
