// Package audit records security-relevant events (OpenSpec change `audit-log`).
//
// The event catalogue is closed and lives in this file. Events are built only
// through the typed constructors below: Event's detail payload is unexported, so
// code outside this package cannot attach arbitrary keys, and every key a
// constructor may set is in allowedDetailKeys. Task and project content can
// therefore never reach the log by accident; TestConstructorsNeverCarryEntityFields
// checks the allow-list against the op schema and a list of secret field names.
//
// Changes that add new ways to gain or change access (passkeys, oidc-login,
// mfa-totp, backups, roles) call the constructors for their events and record
// them with Recorder.RecordTx inside the transaction of the state change, or with
// Recorder.Record for pure observations.
package audit

import (
	"maps"
	"strconv"
)

// Name is an event name from the closed catalogue.
type Name string

// The event catalogue (design D1). Names not yet emitted by any capability simply
// never appear in the log.
const (
	LoginSucceededName     Name = "login.succeeded"
	LoginFailedName        Name = "login.failed"
	LogoutName             Name = "logout"
	MFAEnrolledName        Name = "mfa.enrolled"
	MFADisabledName        Name = "mfa.disabled"
	MFAResetName           Name = "mfa.reset"
	MFAChallengeFailedName Name = "mfa.challenge_failed"
	PasskeyRegisteredName  Name = "passkey.registered"
	PasskeyDeletedName     Name = "passkey.deleted"
	TokenCreatedName       Name = "token.created"
	TokenRevokedName       Name = "token.revoked"
	// CalDAV app passwords (OpenSpec `caldav`).
	AppPasswordCreatedName Name = "app_password.created"
	AppPasswordRevokedName Name = "app_password.revoked"
	// Email capture inbox address (OpenSpec `email-to-task`).
	EmailInboxCreatedName  Name = "email_inbox.created"
	EmailInboxRotatedName  Name = "email_inbox.rotated"
	EmailInboxUpdatedName  Name = "email_inbox.updated"
	InvitationCreatedName  Name = "invitation.created"
	InvitationAcceptedName Name = "invitation.accepted"
	InvitationRevokedName  Name = "invitation.revoked"
	RoleChangedName        Name = "role.changed"
	SettingsChangedName    Name = "settings.changed"
	IdentityLinkedName     Name = "identity.linked"
	IdentityUnlinkedName   Name = "identity.unlinked"
	ExportRequestedName    Name = "export.requested"
	AuditExportedName      Name = "audit.exported"
	BackupCreatedName      Name = "backup.created"
	BackupRestoredName     Name = "backup.restored"
	// User administration (user-management).
	UserDeactivatedName        Name = "user.deactivated"
	UserReactivatedName        Name = "user.reactivated"
	UserDeletedName            Name = "user.deleted"
	PasswordResetIssuedName    Name = "password.reset_issued"
	PasswordResetCompletedName Name = "password.reset_completed"
	PasswordChangedName        Name = "password.changed"
	OwnerTransferredName       Name = "owner.transferred"
	// A write tool call made with an `agent` token (mcp-write-tools D6): the
	// one deliberate exception to "task edits are not events", without content.
	AgentWriteName Name = "agent.write"
)

// Names lists the whole catalogue in a stable order (used by the API docs, the
// client filter and validation of the `name` filter).
var Names = []Name{
	LoginSucceededName, LoginFailedName, LogoutName,
	MFAEnrolledName, MFADisabledName, MFAResetName, MFAChallengeFailedName,
	PasskeyRegisteredName, PasskeyDeletedName,
	TokenCreatedName, TokenRevokedName,
	AppPasswordCreatedName, AppPasswordRevokedName,
	EmailInboxCreatedName, EmailInboxRotatedName, EmailInboxUpdatedName,
	InvitationCreatedName, InvitationAcceptedName, InvitationRevokedName,
	RoleChangedName, SettingsChangedName,
	IdentityLinkedName, IdentityUnlinkedName,
	ExportRequestedName, AuditExportedName,
	BackupCreatedName, BackupRestoredName,
	UserDeactivatedName, UserReactivatedName, UserDeletedName,
	PasswordResetIssuedName, PasswordResetCompletedName, PasswordChangedName,
	OwnerTransferredName,
	AgentWriteName,
}

// PersonalNames are the events a user sees about themselves in
// GET /api/v1/me/activity: sign-ins, sign-outs, credentials and tokens.
var PersonalNames = []Name{
	LoginSucceededName, LoginFailedName, LogoutName,
	MFAEnrolledName, MFADisabledName, MFAResetName, MFAChallengeFailedName,
	PasskeyRegisteredName, PasskeyDeletedName,
	TokenCreatedName, TokenRevokedName,
	AppPasswordCreatedName, AppPasswordRevokedName,
	EmailInboxCreatedName, EmailInboxRotatedName, EmailInboxUpdatedName,
	IdentityLinkedName, IdentityUnlinkedName,
	PasswordResetCompletedName, PasswordChangedName,
	AgentWriteName,
}

// Known reports whether n is in the catalogue.
func Known(n Name) bool {
	for _, k := range Names {
		if k == n {
			return true
		}
	}
	return false
}

// Outcome of an event.
const (
	Success = "success"
	Failure = "failure"
)

// Login failure reasons.
const (
	ReasonUnknownAccount = "unknown_account"
	ReasonWrongPassword  = "wrong_password"
	ReasonRateLimited    = "rate_limited"
	// Passkey sign-in failures.
	ReasonUnknownPasskey  = "unknown_passkey"
	ReasonPasskeyRejected = "passkey_rejected"
	ReasonPasskeyCounter  = "passkey_counter_regression"
	// ReasonDeactivated: the correct password of a deactivated account.
	ReasonDeactivated = "deactivated"
)

// allowedDetailKeys is the complete set of keys an event's details may carry:
// identifiers, names of credentials and settings, and short reason codes. Never
// add a key that could hold a field of a synced entity, a password, a token
// secret, a one-time code or a recovery code.
var allowedDetailKeys = map[string]bool{
	"method":            true, // sign-in method: password, register, passkey, oidc
	"email":             true, // snapshot of the account's email (readable after deletion)
	"reason":            true, // short failure reason code
	"token_id":          true,
	"token_name":        true,
	"token_scope":       true, // full | read | agent (mcp-server, mcp-write-tools)
	"tool":              true, // name of an AI assistant write tool (mcp-write-tools)
	"app_password_id":   true,
	"app_password_name": true,
	"invitation_id":     true,
	"invited_email":     true, // email an invitation is bound to, if any
	"passkey_id":        true,
	"passkey_name":      true,
	"setting":           true, // settings key, e.g. audit.retention_days
	"from":              true, // previous value of a setting or role
	"to":                true, // new value of a setting or role
	"provider":          true, // identity provider name
	"format":            true, // export format
	"count":             true, // number of exported events, or entities an assistant changed
	"backup_id":         true,
	"reset_id":          true, // id of a password reset link (never its secret)
}

// Event is one security-relevant occurrence. Build it with a constructor.
type Event struct {
	Name     Name
	Outcome  string
	ActorID  string // account that acted; empty when unknown (failed sign-in)
	TargetID string // account acted upon, when different from the actor
	details  map[string]string
}

// Details returns a copy of the event's allow-listed detail payload.
func (e Event) Details() map[string]string { return maps.Clone(e.details) }

// Failed returns a copy of e with outcome failure and the given reason code, for
// capabilities whose state change can fail (e.g. a backup restore).
func (e Event) Failed(reason string) Event {
	e.Outcome = Failure
	e.details = maps.Clone(e.details)
	if e.details == nil {
		e.details = map[string]string{}
	}
	e.details["reason"] = reason
	return e
}

func ev(name Name, outcome, actor, target string, kv ...string) Event {
	e := Event{Name: name, Outcome: outcome, ActorID: actor, TargetID: target}
	if target == actor {
		e.TargetID = ""
	}
	for i := 0; i+1 < len(kv); i += 2 {
		if kv[i+1] == "" {
			continue
		}
		if e.details == nil {
			e.details = map[string]string{}
		}
		e.details[kv[i]] = kv[i+1]
	}
	return e
}

// ---- access ----

// LoginSucceeded records a sign-in. method is password, register, passkey or oidc.
func LoginSucceeded(userID, email, method string) Event {
	return ev(LoginSucceededName, Success, userID, "", "email", email, "method", method)
}

// LoginFailed records a refused sign-in. targetID and email are empty when the
// account does not exist; the submitted password is never passed in.
func LoginFailed(targetID, email, reason string) Event {
	return ev(LoginFailedName, Failure, "", targetID, "email", email, "reason", reason)
}

// Logout records a sign-out.
func Logout(userID string) Event { return ev(LogoutName, Success, userID, "") }

// ---- second factor (mfa-totp) ----

// MFAEnrolled records a user enabling a second factor (method, e.g. totp).
func MFAEnrolled(userID, method string) Event {
	return ev(MFAEnrolledName, Success, userID, "", "method", method)
}

// MFADisabled records a second factor being turned off by actor for target.
func MFADisabled(actorID, targetID, method string) Event {
	return ev(MFADisabledName, Success, actorID, targetID, "method", method)
}

// MFAReset records the owner resetting another account's second factor.
func MFAReset(actorID, targetID string) Event {
	return ev(MFAResetName, Success, actorID, targetID)
}

// MFAChallengeFailed records a wrong second-factor code. The code itself is never
// passed in; reason is a short code such as wrong_code or expired.
func MFAChallengeFailed(targetID, reason string) Event {
	return ev(MFAChallengeFailedName, Failure, "", targetID, "reason", reason)
}

// ---- passkeys ----

// PasskeyRegistered records a new passkey.
func PasskeyRegistered(userID, passkeyID, name string) Event {
	return ev(PasskeyRegisteredName, Success, userID, "", "passkey_id", passkeyID, "passkey_name", name)
}

// PasskeyDeleted records the removal of a passkey by actor from target's account.
func PasskeyDeleted(actorID, targetID, passkeyID, name string) Event {
	return ev(PasskeyDeletedName, Success, actorID, targetID, "passkey_id", passkeyID, "passkey_name", name)
}

// ---- API tokens ----

// TokenCreated records a new API token (never its secret).
func TokenCreated(userID, tokenID, name string) Event {
	return ev(TokenCreatedName, Success, userID, "", "token_id", tokenID, "token_name", name)
}

// TokenCreatedScoped records a new API token with its scope (never its secret).
func TokenCreatedScoped(userID, tokenID, name, scope string) Event {
	return ev(TokenCreatedName, Success, userID, "", "token_id", tokenID, "token_name", name, "token_scope", scope)
}

// AgentWrite records one write tool call of an AI assistant's `agent` token
// (mcp-write-tools D6): the tool name, the token and how many entities it
// changed. Never content and never entity ids. A refused call is recorded with
// Failed(reason) and count 0.
func AgentWrite(userID, tool, tokenID, tokenName string, count int) Event {
	return ev(AgentWriteName, Success, userID, "", "tool", tool, "token_id", tokenID, "token_name", tokenName, "count", strconv.Itoa(count))
}

// TokenRevoked records a revoked API token.
func TokenRevoked(userID, tokenID, name string) Event {
	return ev(TokenRevokedName, Success, userID, "", "token_id", tokenID, "token_name", name)
}

// ---- CalDAV app passwords ----

// AppPasswordCreated records a new CalDAV app password (never its secret).
func AppPasswordCreated(userID, id, name string) Event {
	return ev(AppPasswordCreatedName, Success, userID, "", "app_password_id", id, "app_password_name", name)
}

// AppPasswordRevoked records a revoked CalDAV app password.
func AppPasswordRevoked(userID, id, name string) Event {
	return ev(AppPasswordRevokedName, Success, userID, "", "app_password_id", id, "app_password_name", name)
}

// ---- email capture ----

// EmailInboxCreated records the creation of an account's inbox address (never
// its secret).
func EmailInboxCreated(userID string) Event {
	return ev(EmailInboxCreatedName, Success, userID, "")
}

// EmailInboxRotated records a new inbox address secret; the old one stops
// working at once.
func EmailInboxRotated(userID string) Event {
	return ev(EmailInboxRotatedName, Success, userID, "")
}

// EmailInboxUpdated records a change of an inbox setting: setting is "enabled"
// (from/to true or false) or "allowlist" (from/to are entry counts, never the
// addresses).
func EmailInboxUpdated(userID, setting, from, to string) Event {
	return ev(EmailInboxUpdatedName, Success, userID, "", "setting", setting, "from", from, "to", to)
}

// ---- invitations ----

// InvitationCreated records an invitation; boundEmail is empty for an open link.
func InvitationCreated(ownerID, invitationID, boundEmail string) Event {
	return ev(InvitationCreatedName, Success, ownerID, "", "invitation_id", invitationID, "invited_email", boundEmail)
}

// InvitationAccepted records the account created from an invitation.
func InvitationAccepted(userID, email, invitationID string) Event {
	return ev(InvitationAcceptedName, Success, userID, "", "email", email, "invitation_id", invitationID)
}

// InvitationRevoked records a revoked invitation.
func InvitationRevoked(ownerID, invitationID string) Event {
	return ev(InvitationRevokedName, Success, ownerID, "", "invitation_id", invitationID)
}

// ---- roles and settings ----

// RoleChanged records actor changing target's role.
func RoleChanged(actorID, targetID, from, to string) Event {
	return ev(RoleChangedName, Success, actorID, targetID, "from", from, "to", to)
}

// SettingsChanged records a server setting change. Values must be setting values
// (numbers, booleans, provider names), never secrets: callers changing a secret
// setting pass "(changed)" instead of the value.
func SettingsChanged(actorID, setting, from, to string) Event {
	return ev(SettingsChangedName, Success, actorID, "", "setting", setting, "from", from, "to", to)
}

// ---- single sign-on (oidc-login) ----

// IdentityLinked records an external identity linked to an account.
func IdentityLinked(userID, provider string) Event {
	return ev(IdentityLinkedName, Success, userID, "", "provider", provider)
}

// IdentityUnlinked records an external identity removed from an account.
func IdentityUnlinked(userID, provider string) Event {
	return ev(IdentityUnlinkedName, Success, userID, "", "provider", provider)
}

// ---- exports and backups ----

// ExportRequested records a user data export (format, e.g. json).
func ExportRequested(userID, format string) Event {
	return ev(ExportRequestedName, Success, userID, "", "format", format)
}

// AuditExported records an export of the audit log itself.
func AuditExported(userID string, count int) Event {
	return ev(AuditExportedName, Success, userID, "", "format", "ndjson", "count", strconv.Itoa(count))
}

// BackupCreated records a backup of the data directory.
func BackupCreated(actorID, backupID string) Event {
	return ev(BackupCreatedName, Success, actorID, "", "backup_id", backupID)
}

// BackupRestored records a restore from a backup.
func BackupRestored(actorID, backupID string) Event {
	return ev(BackupRestoredName, Success, actorID, "", "backup_id", backupID)
}

// ---- user administration (user-management) ----

// UserDeactivated records actor deactivating target.
func UserDeactivated(actorID, targetID string) Event {
	return ev(UserDeactivatedName, Success, actorID, targetID)
}

// UserReactivated records actor reactivating target.
func UserReactivated(actorID, targetID string) Event {
	return ev(UserReactivatedName, Success, actorID, targetID)
}

// UserDeleted records actor deleting target, with a snapshot of the deleted
// account's email so the event stays readable after the account is gone.
func UserDeleted(actorID, targetID, email string) Event {
	return ev(UserDeletedName, Success, actorID, targetID, "email", email)
}

// PasswordResetIssued records a reset link for target; actor is empty when it
// was issued from the server shell. The link secret is never passed in.
func PasswordResetIssued(actorID, targetID, resetID string) Event {
	return ev(PasswordResetIssuedName, Success, actorID, targetID, "reset_id", resetID)
}

// PasswordResetCompleted records target setting a new password through a reset
// link. The new password is never passed in.
func PasswordResetCompleted(targetID, resetID string) Event {
	return ev(PasswordResetCompletedName, Success, targetID, "", "reset_id", resetID)
}

// PasswordChanged records a user changing their own password.
func PasswordChanged(userID string) Event {
	return ev(PasswordChangedName, Success, userID, "")
}

// OwnerTransferred records the owner handing ownership to another account; the
// previous owner becomes an admin.
func OwnerTransferred(fromID, toID string) Event {
	return ev(OwnerTransferredName, Success, fromID, toID, "from", "owner", "to", "admin")
}
