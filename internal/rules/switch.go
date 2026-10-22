package rules

import (
	"context"
	"errors"

	"github.com/pixari/opentodo/internal/settings"
)

// SettingKey is the owner setting that turns automations on or off for the
// server (design D9). Default on.
const SettingKey = "automations.enabled"

// ErrSetByEnvironment refuses a change of a switch OPENTODO_AUTOMATIONS fixes.
var ErrSetByEnvironment = errors.New("set by OPENTODO_AUTOMATIONS")

// Switch is the server's automations switch: the owner setting, overridden by
// the optional environment variable.
type Switch struct {
	store *settings.Store
	env   *bool
}

// NewSwitch reads the setting from store; env is OPENTODO_AUTOMATIONS (nil when unset).
func NewSwitch(store *settings.Store, env *bool) *Switch { return &Switch{store: store, env: env} }

// Effective reports whether automations run and whether the variable fixes it.
func (s *Switch) Effective(ctx context.Context) (enabled, locked bool, err error) {
	if s.env != nil {
		return *s.env, true, nil
	}
	enabled = true
	if _, err := s.store.Get(ctx, SettingKey, &enabled); err != nil {
		return false, false, err
	}
	return enabled, false, nil
}

// On is Effective's answer, off when the setting cannot be read.
func (s *Switch) On(ctx context.Context) bool {
	on, _, err := s.Effective(ctx)
	return err == nil && on
}

// Set stores the owner's choice.
func (s *Switch) Set(ctx context.Context, on bool) error {
	if s.env != nil {
		return ErrSetByEnvironment
	}
	return s.store.Set(ctx, SettingKey, on)
}
