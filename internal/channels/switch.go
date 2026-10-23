package channels

import (
	"context"
	"sync/atomic"

	"github.com/pixari/opentodo/internal/settings"
)

// SettingKey is the owner switch in the settings table (design D9): on unless
// the owner turned it off.
const SettingKey = "notifications.channels"

// ownerSwitch caches the setting: 0 unknown, 1 off, 2 on.
type ownerSwitch struct{ v atomic.Int32 }

// switchOn reads the owner switch through the cache.
func (s *Service) switchOn(ctx context.Context) bool {
	switch s.sw.v.Load() {
	case 1:
		return false
	case 2:
		return true
	}
	on := true
	found, err := settings.New(s.db).Get(ctx, SettingKey, &on)
	if err != nil {
		s.log.Error("notification channels: read setting", "err", err)
		return false
	}
	if !found {
		on = true
	}
	s.cache(on)
	return on
}

func (s *Service) cache(on bool) {
	if on {
		s.sw.v.Store(2)
	} else {
		s.sw.v.Store(1)
	}
}

// SetEnabled stores the owner switch and reports the previous value.
func (s *Service) SetEnabled(ctx context.Context, on bool) (bool, error) {
	before := s.On(ctx)
	if err := settings.New(s.db).Set(ctx, SettingKey, on); err != nil {
		return before, err
	}
	s.cache(on)
	if on {
		s.Wake()
	}
	return before, nil
}
