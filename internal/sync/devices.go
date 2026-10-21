package sync

import (
	"context"
	"database/sql"
	"errors"
	"strings"
)

// Reserved device prefixes (mcp-write-tools D4). Ops with these devices are
// written only by the server: CalDAV clients (caldav:<app-password-id>) and AI
// assistants (agent:<token-id>). /api/v1/sync refuses them from devices, so a
// device cannot make its edits look like an assistant's or a calendar app's.
const (
	AgentDevicePrefix  = "agent:"
	CaldavDevicePrefix = "caldav:"
)

// IssuesDevicePrefix marks the ops an issue connection's polls write
// (issue-import): issues:<connection-id>. Reserved like agent: and caldav:.
const IssuesDevicePrefix = "issues:"

// AssistantDevicePrefix marks ops a device applied from an in-app assistant
// proposal (in-app-assistant D1): assistant:<device-id>. Unlike agent: and
// caldav: it is written by devices, so /api/v1/sync accepts it; history labels
// it "Assistant".
const AssistantDevicePrefix = "assistant:"

// PublicDevicePrefix marks ops a guest wrote through a public link
// (public-links D4): public:<link-id>, applied by the server as the link's
// creator. Reserved like agent: and caldav:.
const PublicDevicePrefix = "public:"

// PublicDevice is the device id of a public link's ticks.
func PublicDevice(linkID string) string { return PublicDevicePrefix + linkID }

// IsPublicDevice reports whether device is a public link's.
func IsPublicDevice(device string) bool { return strings.HasPrefix(device, PublicDevicePrefix) }

// PageDevicePrefix marks ops a guest wrote through a task page (OpenSpec
// task-pages, design D5): page:<page-id>, applied by the server as the page's
// publisher. Reserved like public:.
const PageDevicePrefix = "page:"

// PageDevice is the device id of a task page's guest writes.
func PageDevice(pageID string) string { return PageDevicePrefix + pageID }

// IsPageDevice reports whether device is a task page's.
func IsPageDevice(device string) bool { return strings.HasPrefix(device, PageDevicePrefix) }

// AgentDevice is the device id of the ops an AI assistant's token writes.
func AgentDevice(tokenID string) string { return AgentDevicePrefix + tokenID }

// IsAgentDevice reports whether device is an AI assistant's.
func IsAgentDevice(device string) bool { return strings.HasPrefix(device, AgentDevicePrefix) }

// ReservedDevice reports whether a device id may only be written by the server.
// The server's own device (REST writes, attachment uploads: uploaded_at is
// trusted only from it) is reserved too (OpenSpec change attachments, design D3).
func ReservedDevice(device string) bool {
	return IsServerDevice(device) || strings.HasPrefix(device, AgentDevicePrefix) || strings.HasPrefix(device, CaldavDevicePrefix) ||
		strings.HasPrefix(device, PublicDevicePrefix) || strings.HasPrefix(device, IssuesDevicePrefix) ||
		strings.HasPrefix(device, PageDevicePrefix)
}

// CreatedBy returns the device of the first stored created_at op of an entity
// in the scopes userID can see ("" when there is none). trash_tasks uses it to
// let an assistant move only its own creations to the Trash (mcp-write-tools D6).
func (s *Service) CreatedBy(ctx context.Context, userID, entity, id string) (string, error) {
	acc, err := loadAccess(ctx, s.db, userID)
	if err != nil {
		return "", err
	}
	scopes := acc.scopes()
	var device string
	err = s.db.QueryRowContext(ctx, `SELECT o.device FROM ops o JOIN op_scopes sc ON sc.seq = o.seq
		WHERE o.entity = ? AND o.entity_id = ? AND o.field = 'created_at' AND sc.scope_id IN (`+placeholders(len(scopes))+`)
		ORDER BY o.seq LIMIT 1`, append([]any{entity, id}, anys(scopes)...)...).Scan(&device)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return device, err
}
