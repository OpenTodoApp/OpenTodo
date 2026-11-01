package ruleval

import (
	"encoding/json"
	"slices"
)

// Availability of a step (OpenSpec change routines-engine, design D15): a
// step is offered only when what it needs is configured and switched on.

// Reasons a step is not available.
const (
	ReasonAutomationsOff     = "automations_off"
	ReasonEmailNotConfigured = "email_not_configured"
	ReasonEmailNotVerified   = "email_not_verified"
	ReasonEncrypted          = "encrypted"
	ReasonNoWebhook          = "no_webhook"
	ReasonEnergyOff          = "energy_off"
	ReasonFocusOff           = "focus_off"
	ReasonTimeTrackingOff    = "time_tracking_off"
	ReasonNotShared          = "not_shared"
	ReasonDemo               = "demo"
	// Shared routines (routines-shared D3, D8): a step that acts on personal
	// things, and Email project members until routines-shared-email.
	ReasonNotInShared = "not_in_shared"
	ReasonNotYet      = "not_yet"
	// AI steps (routines-ai-step D1, D10).
	ReasonAINotConfigured = "ai_not_configured"
	ReasonAINoConsent     = "ai_no_consent"
	// ReasonAIEncrypted: an encrypted account's AI steps need one of its
	// devices with the on-device assistant to run them (routines-ai-step D7).
	ReasonAIEncrypted = "ai_encrypted"
)

// Settings that fix a reason (the web app links them; "" when nothing can).
var reasonSettings = map[string]string{
	ReasonAutomationsOff:     "server.automations",
	ReasonEmailNotConfigured: "server.email",
	ReasonEmailNotVerified:   "account.email",
	ReasonNoWebhook:          "integrations.webhooks",
	ReasonEnergyOff:          "how_you_work.energy",
	ReasonFocusOff:           "how_you_work.focus",
	ReasonTimeTrackingOff:    "how_you_work",
	ReasonAINotConfigured:    "integrations.assistant",
	ReasonAINoConsent:        "integrations.assistant",
}

// reasonText is the sentence a run log and a notice show.
var reasonText = map[string]string{
	ReasonAutomationsOff:     "automations are turned off on this server",
	ReasonEmailNotConfigured: "outgoing email is not set up on this server",
	ReasonEmailNotVerified:   "the account's email address is not verified",
	ReasonEncrypted:          "this step would send text through the server, which an encrypted account never does",
	ReasonNoWebhook:          "the webhook does not exist or is turned off",
	ReasonEnergyOff:          "Energy levels are turned off",
	ReasonFocusOff:           "today's focus is turned off",
	ReasonTimeTrackingOff:    "time tracking is turned off",
	ReasonNotShared:          "the routine does not belong to a shared project",
	ReasonNotInShared:        "not available in a shared routine",
	ReasonNotYet:             "not available yet",
	ReasonDemo:               "not offered on a demo instance",
	ReasonAINotConfigured:    "the assistant is not set up for you on this server",
	ReasonAINoConsent:        "accept the assistant's updated terms for routines",
	ReasonAIEncrypted:        "turn on Run my routines on a device with the on-device assistant set up",
}

// SettingFor is the setting that fixes a reason ("" when none can).
func SettingFor(reason string) string { return reasonSettings[reason] }

// ReasonText is a reason as a sentence.
func ReasonText(reason string) string {
	if t, ok := reasonText[reason]; ok {
		return t
	}
	return reason
}

// Env is the server state and the user's preferences availability reads.
type Env struct {
	Automations     bool
	Demo            bool
	EmailConfigured bool
	EmailVerified   bool
	Encrypted       bool
	// Webhooks are the ids of the user's enabled webhooks.
	Webhooks        []string
	Energy          bool
	FocusOff        bool
	TimeTrackingOff bool
	// Shared is true for a routine that belongs to a shared project (routines-shared).
	Shared bool
	// AI: the assistant is usable by the user (a provider with a key, or on
	// an encrypted account a device that runs routines with its on-device
	// assistant); AIConsent: the user accepted the disclosure for routines
	// (routines-ai-step D1, D10).
	AI        bool
	AIConsent bool
}

// NotInShared lists the step kinds that act on personal things, not available
// in a routine of a shared project (routines-shared D3): its run sees only the
// project, and labels, focus, timers, other projects, Email me and webhooks
// belong to one member.
var NotInShared = map[string]bool{
	"favourite": true, "set_focus": true, "start_timer": true, "stop_timer": true, "tracked_time": true,
	"create_project": true, "update_project": true, "project_from_template": true, "create_labels": true,
	"email_me": true, "webhook": true,
}

// Availability is whether a step can run and, when not, why and where to fix it.
type Availability struct {
	Available bool   `json:"available"`
	Reason    string `json:"reason,omitempty"`
	Setting   string `json:"setting,omitempty"`
}

func unavailable(reason string) Availability {
	return Availability{Reason: reason, Setting: reasonSettings[reason]}
}

// Available is a step kind's availability. Notify me is always available: the
// in-app notification needs nothing, delivery channels only add to it.
func Available(kind string, env Env) Availability {
	k, ok := StepKindOf(kind)
	if !ok {
		return Availability{}
	}
	if !env.Automations {
		return unavailable(ReasonAutomationsOff)
	}
	if env.Shared && NotInShared[kind] {
		return unavailable(ReasonNotInShared)
	}
	if k.Needs == NeedsShared && env.Shared {
		return unavailable(ReasonNotYet)
	}
	switch k.Needs {
	case NeedsEmail, NeedsShared:
		switch {
		case env.Demo:
			return unavailable(ReasonDemo)
		case !env.EmailConfigured:
			return unavailable(ReasonEmailNotConfigured)
		case env.Encrypted:
			return unavailable(ReasonEncrypted)
		case !env.EmailVerified:
			return unavailable(ReasonEmailNotVerified)
		case k.Needs == NeedsShared && !env.Shared:
			return unavailable(ReasonNotShared)
		}
	case NeedsWebhook:
		if env.Demo {
			return unavailable(ReasonDemo)
		}
		if len(env.Webhooks) == 0 {
			return unavailable(ReasonNoWebhook)
		}
	case NeedsTimeTracking:
		if env.TimeTrackingOff {
			return unavailable(ReasonTimeTrackingOff)
		}
	case NeedsFocus:
		if env.FocusOff {
			return unavailable(ReasonFocusOff)
		}
	case NeedsAI:
		switch {
		case env.Encrypted && !env.AI:
			return unavailable(ReasonAIEncrypted)
		case !env.AI:
			return unavailable(ReasonAINotConfigured)
		case !env.AIConsent:
			return unavailable(ReasonAINoConsent)
		}
	}
	return Availability{Available: true}
}

// StepAvailable is one step's availability: its kind's, and what its inputs
// need (the webhook it names; energy changes need the Energy levels switch).
func StepAvailable(s *Step, env Env) Availability {
	a := Available(s.Kind, env)
	if !a.Available {
		return a
	}
	switch s.Kind {
	case "webhook":
		var id string
		_ = json.Unmarshal(s.In["webhook_id"].Lit, &id)
		if !slices.Contains(env.Webhooks, id) {
			return unavailable(ReasonNoWebhook)
		}
		// Its text would pass through the server in plaintext (routines-ai-step D7).
		if _, text := s.In["text"]; text && env.Encrypted {
			return unavailable(ReasonEncrypted)
		}
	case "change_tasks":
		if set, err := ParseStepActions(s.In["set"].Lit); err == nil && set.Energy != nil && !env.Energy {
			return unavailable(ReasonEnergyOff)
		}
	case "create_tasks":
		if _, has := s.In["energy"]; has && !env.Energy {
			return unavailable(ReasonEnergyOff)
		}
	}
	return a
}

// Unavailable lists a routine's steps that cannot run now, in order.
func Unavailable(steps []Step, env Env) []StepWarning {
	var out []StepWarning
	Walk(steps, func(s *Step) {
		if a := StepAvailable(s, env); !a.Available {
			out = append(out, StepWarning{Step: s.ID, Kind: s.Kind, Reason: a.Reason, Setting: a.Setting, Message: ReasonText(a.Reason)})
		}
	})
	return out
}

// StepWarning names a step a saved routine holds that is not available.
type StepWarning struct {
	Step    string `json:"step"`
	Kind    string `json:"kind"`
	Reason  string `json:"reason"`
	Setting string `json:"setting,omitempty"`
	Message string `json:"message"`
}
