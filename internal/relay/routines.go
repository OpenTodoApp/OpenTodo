package relay

import (
	"encoding/json"
	"errors"
)

// Routine runs over the relay (OpenSpec change routines-ai-step, design D7):
// the server sends a sealed routine.run request with ids and numbers only to
// one device opted in to run routines; the device answers on the rules
// routes (commit or fail), never on /relay/answers.

// MaxRoutineEvents bounds the routine runs queued on one stream (one per
// routine waits, design D9; more wait for the next stream).
const MaxRoutineEvents = 32

// RoutineRun is one routine.run request. It holds no content.
type RoutineRun struct {
	Op     string `json:"op"` // always "routine.run"
	RuleID string `json:"rule"`
	RunID  string `json:"run"`
	// Key is the occurrence key; At its time (Unix ms).
	Key    string `json:"occurrence"`
	At     int64  `json:"at"`
	TaskID string `json:"task,omitempty"`
	// Rev is the routine's revision the commit must match.
	Rev string `json:"rev"`
	// Auto: the routine is in effective auto mode; Tokens: its AI tokens of
	// today; Budget: its daily budget (D11).
	Auto   bool  `json:"auto"`
	Tokens int64 `json:"tokens"`
	Budget int64 `json:"budget"`
}

// OpRoutineRun is RoutineRun.Op.
const OpRoutineRun = "routine.run"

// ErrNoDevice is a routine run no suitable device is online for.
var ErrNoDevice = errors.New("relay: no device can run this routine now")

// Sent is the device a routine run went to and the session it is bound to.
type Sent struct {
	DeviceID    string
	SessionHash string
}

// pickRoutines returns the most recently active stream of the account that
// runs routines and announced the capabilities needed; prefer, when online
// and suitable, wins.
func (h *Hub) pickRoutines(userID string, needAI bool, prefer string) *Stream {
	var best *Stream
	for _, s := range h.streams[userID] {
		if !s.Roles.Routines || !s.Roles.has(CapRoutines) || (needAI && !s.Roles.has(CapAI)) {
			continue
		}
		if prefer != "" && s.DeviceID == prefer {
			return s
		}
		if best == nil || s.lastSeen.After(best.lastSeen) {
			best = s
		}
	}
	return best
}

// CanRun reports whether a device that can run the routine is online now.
func (h *Hub) CanRun(userID string, needAI bool) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.pickRoutines(userID, needAI, "") != nil
}

// SendRoutine seals a routine.run request to one suitable online device
// (prefer, when given and suitable; else the most recently active one). It
// never blocks: a full stream counts as no device.
func (h *Hub) SendRoutine(userID string, needAI bool, prefer string, run RoutineRun) (Sent, error) {
	run.Op = OpRoutineRun
	h.mu.Lock()
	s := h.pickRoutines(userID, needAI, prefer)
	h.mu.Unlock()
	if s == nil {
		return Sent{}, ErrNoDevice
	}
	raw, err := json.Marshal(run)
	if err != nil {
		return Sent{}, err
	}
	// The run id is the additional data: a box cannot be replayed as another run.
	box, err := s.key.seal(raw, run.RunID)
	if err != nil {
		return Sent{}, err
	}
	data, _ := json.Marshal(map[string]string{"id": run.RunID, "box": box})
	select {
	case s.events <- Event{Name: "routine", Data: string(data)}:
		return Sent{DeviceID: s.DeviceID, SessionHash: s.SessionHash}, nil
	case <-s.done:
		return Sent{}, ErrNoDevice
	default:
		return Sent{}, ErrNoDevice
	}
}
