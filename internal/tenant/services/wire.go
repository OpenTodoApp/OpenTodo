package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/OpenTodoApp/opentodo/internal/blobs"
	"github.com/OpenTodoApp/opentodo/internal/importer"
	"github.com/OpenTodoApp/opentodo/internal/maps"
	"github.com/OpenTodoApp/opentodo/internal/oidc"
	ob "github.com/OpenTodoApp/opentodo/internal/outbound"
	"github.com/OpenTodoApp/opentodo/internal/settings"
	opsync "github.com/OpenTodoApp/opentodo/internal/sync"
)

// The keys of the owner switches httpapi serves (settings.Switch).
const (
	CalDAVKey        = "caldav.enabled"
	CalendarFeedsKey = "calendar_feeds.enabled"
	IssuesKey        = "integrations.issues"
	CalendarSyncKey  = "calendar_sync.enabled"
	// MembersInviteKey is "Members can invite new people with project and
	// workspace invite links" (project-invite-links).
	MembersInviteKey = "project_invites.members_create_accounts"
)

// openSwitches builds the owner switches, seeds the OPENTODO_CALDAV and
// OPENTODO_CALENDAR_FEEDS presets on first start and connects the workers that
// follow a switch. Integrations that must stay off on a demo instance are
// fixed off there.
func (s *Set) openSwitches(ctx context.Context, db *sql.DB) {
	open := func(key string, demoOff bool) *settings.Switch {
		o := settings.SwitchOptions{Log: s.Log}
		if demoOff && s.Demo != nil {
			off := false
			o.Fixed, o.FixedBy = &off, "OPENTODO_DEMO"
		}
		return settings.NewSwitch(db, key, o)
	}
	s.CalDAV = open(CalDAVKey, false)
	s.CalendarFeeds = open(CalendarFeedsKey, true)
	s.IssuesOn = open(IssuesKey, true)
	s.CalendarSync = open(CalendarSyncKey, true)
	s.MembersInvite = open(MembersInviteKey, false)
	if _, err := s.CalDAV.Seed(ctx, s.Cfg.CalDAV); err != nil {
		s.Log.Error("seed caldav setting", "err", err)
	}
	if _, err := s.CalendarFeeds.Seed(ctx, s.Cfg.CalendarFeeds); err != nil {
		s.Log.Error("seed calendar feeds setting", "err", err)
	}
	s.Calendar.Enabled = s.CalendarFeeds.On
	s.Calendar.Notify = s.Sync.Notifier().NotifyCalendar
	s.Issues.Enabled = s.IssuesOn.On
	s.CalSync.Enabled = s.CalendarSync.On
	s.CalSync.Notify = s.Sync.Notifier().NotifyCalendar
	if s.Cfg.BaseURL != nil {
		s.CalSync.BaseURL = strings.TrimRight(s.Cfg.BaseURL.String(), "/")
	}
}

// wireAccounts connects accounts to the other services: single sign-on and
// SSO-only mode (oidc-login D6), passkeys' relying party (derived from the
// base URL, so the 409 guard in the handlers and the service always agree),
// deleting an account's synced data in the same transaction (user-management
// D4) and a demo sandbox's write budget (demo-sandboxes D3).
func (s *Set) wireAccounts() {
	cfg := s.Cfg
	s.OIDC = oidc.New(s.Settings, cfg.DataDir, oidc.Options{Env: oidc.Env(cfg.OIDC)})
	s.Auth.SetSSOOnly(s.OIDC.SSOOnly)
	if cfg.PasskeysAvailable() && !s.Auth.PasskeysAvailable() {
		s.Auth.ConfigurePasskeys(cfg.RPID(), cfg.Origin())
	}
	s.Auth.SetBeforeDelete(s.Sync.DeleteAccountData)
	if s.Demo != nil {
		s.Sync.SetWriteGuard(s.Demo.Guard())
	}
}

// openImporter builds imports (OpenSpec change named-importers): unpacked
// archives are bounded by the upload limit, an uploaded database is read from
// a private copy under the data directory, and a job reaches webhooks as one
// summary (harden-server-edges).
func (s *Set) openImporter() {
	s.Importer = importer.New(s.Sync.DB(), s.Sync, s.Log)
	tmp := ""
	if s.Cfg.DataDir != "" {
		tmp = filepath.Join(s.Cfg.DataDir, "tmp")
		if err := os.MkdirAll(tmp, 0o700); err != nil {
			s.Log.Warn("import: temporary directory", "err", err)
			tmp = ""
		}
	}
	s.Importer.SetLimits(s.Cfg.ImportMaxBytes(), tmp)
	s.Importer.SetSummaryObserver(s.Hooks.ObserveImport)
}

// openAttachments builds the attachment file store under the data directory
// and gives sync and imports the owner's limits; OPENTODO_ATTACHMENTS_* seed
// them on first start.
func (s *Set) openAttachments(ctx context.Context) {
	if s.Cfg.DataDir != "" {
		b, err := blobs.New(s.Cfg.DataDir)
		if err != nil {
			s.Log.Error("attachments: file store unavailable", "err", err)
		} else {
			s.Blobs = b
		}
	}
	if s.Blobs != nil {
		s.Sync.SetBlobStore(s.Blobs)
		s.Importer.SetBlobs(s.Blobs, func(ctx context.Context, uid string) (int64, int64, error) {
			a, err := s.AttachmentSettings(ctx)
			if err != nil || !a.Enabled {
				return 0, 0, err
			}
			left := int64(-1)
			if q := a.QuotaBytes(); q > 0 {
				used, err := s.AttachmentUsage(ctx, uid)
				if err != nil {
					return 0, 0, err
				}
				left = max(0, q-used)
			}
			return a.MaxFileBytes(), left, nil
		})
	}
	s.Sync.SetAttachmentLimit(func() int64 {
		a, err := s.AttachmentSettings(context.Background())
		if err != nil {
			return 0
		}
		return a.MaxFileBytes()
	})
	s.Sync.SetAttachmentQuota(func() int64 {
		a, err := s.AttachmentSettings(context.Background())
		if err != nil {
			return 0
		}
		return a.QuotaBytes()
	})
	if err := s.Settings.SeedAttachments(ctx, s.Cfg.AttachmentsMaxFileMB, s.Cfg.AttachmentsQuotaMB); err != nil {
		s.Log.Error("attachments: presets", "err", err)
	}
}

// AttachmentSettings are the owner's attachment settings; a demo instance
// refuses every attachment route (attachments design D15).
func (s *Set) AttachmentSettings(ctx context.Context) (settings.Attachments, error) {
	a, err := s.Settings.Attachments(ctx)
	if s.Demo != nil {
		a.Enabled = false
	}
	return a, err
}

// AttachmentUsage is the bytes an account's live, uploaded attachments take
// (attachments design D5: the quota counts what the account authored). A
// removal frees its bytes at once; restoring is checked against the quota
// again by sync (attachment-client-hardening D1).
func (s *Set) AttachmentUsage(ctx context.Context, uid string) (int64, error) {
	rows, err := s.Sync.List(ctx, uid, "attachment", false)
	if err != nil {
		return 0, err
	}
	var total int64
	for _, a := range rows {
		var author string
		_ = json.Unmarshal(a["author_id"], &author)
		if author != uid || opsync.IsNull(a["uploaded_at"]) {
			continue
		}
		var size float64
		_ = json.Unmarshal(a["size"], &size)
		total += int64(size)
	}
	return total, nil
}

// openMaps builds the map proxy (OpenSpec `task-locations`).
func (s *Set) openMaps() {
	client := ob.NewClient(&ob.Dialer{AllowPrivateHost: s.mapsPrivateHost}, 10*time.Second, ob.FollowRedirects(3))
	s.Maps = maps.New(s.Settings, s.Cfg.Maps, s.Cfg.Demo, client,
		maps.NewCache(filepath.Join(s.Cfg.DataDir, "cache", "maps"), maps.DefaultCacheBytes), s.Version)
}

// mapsPrivateHost decides which map hosts may be on a private network. On a
// self-hosted server the owner may run the tile server or Photon on the local
// network, so the two hosts the owner typed are allowed; addresses the
// provider's style hands out (tiles, fonts, sprites) and redirects to other
// hosts go through the normal deny list, so a provider cannot point the server
// at the local network. A hosted tenant's owner is not the operator: nothing
// on the host's network is reachable (private-network-reach D1).
func (s *Set) mapsPrivateHost(ctx context.Context, host string) bool {
	if s.Hosted != nil || s.Maps == nil {
		return false
	}
	e, err := s.Maps.Effective(ctx)
	if err != nil {
		return false
	}
	for _, raw := range []string{e.TilesURL, e.GeocoderURL} {
		if u, err := url.Parse(raw); err == nil && strings.EqualFold(u.Hostname(), host) {
			return true
		}
	}
	return false
}
