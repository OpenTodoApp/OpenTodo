package assistant

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"regexp"

	"github.com/pixari/opentodo/internal/audit"
)

// Member's own provider (OpenSpec change `assistant-member-provider`): while
// the owner allows member keys, a member may choose Anthropic, OpenAI or
// Google Gemini, a model and their own key. The compatible endpoint is never
// offered to members: a URL a member types would let any account make the
// server connect to a host of their choosing (design D2).

// MemberProviders are the providers a member may choose for their own key.
var MemberProviders = []string{Anthropic, OpenAI, Gemini}

// MaxMemberModel is the longest model id a member may type.
const MaxMemberModel = 100

var memberModelRe = regexp.MustCompile(`^[A-Za-z0-9._:-]+$`)

// IsMemberProvider reports whether a member may choose name.
func IsMemberProvider(name string) bool {
	for _, n := range MemberProviders {
		if n == name {
			return true
		}
	}
	return false
}

// ValidateMemberChoice checks a member's provider and model. Anthropic models
// come from the offered list; OpenAI and Gemini model ids are free text of at
// most 100 characters from A-Z, a-z, 0-9 and . _ : -.
func ValidateMemberChoice(provider, model string) error {
	if provider == Compatible {
		return invalid("own_provider", "members cannot use a custom endpoint; choose anthropic, openai or gemini")
	}
	if !IsMemberProvider(provider) {
		return invalid("own_provider", "unknown provider (expected anthropic, openai or gemini)")
	}
	if provider == Anthropic {
		for _, m := range AnthropicModels {
			if m == model {
				return nil
			}
		}
		return invalid("own_model", "choose one of the offered Anthropic models")
	}
	if model == "" || len(model) > MaxMemberModel || !memberModelRe.MatchString(model) {
		return invalid("own_model", fmt.Sprintf("must be a model id of 1 to %d characters (letters, digits, '.', '_', ':' and '-')", MaxMemberModel))
	}
	return nil
}

// MemberChoice is a member's own provider and model (no key: that is in the
// secrets file under UserKey).
type MemberChoice struct {
	Provider  string `json:"provider"`
	Model     string `json:"model"`
	UpdatedAt int64  `json:"updated_at"`
}

// MemberChoice returns the user's own provider choice, or nil ("use the
// server's assistant").
func (st *Store) MemberChoice(ctx context.Context, userID string) (*MemberChoice, error) {
	var c MemberChoice
	err := st.db.QueryRowContext(ctx, `SELECT provider, model, updated_at FROM assistant_member_provider WHERE user_id = ?`, userID).
		Scan(&c.Provider, &c.Model, &c.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read assistant member provider: %w", err)
	}
	return &c, nil
}

// SetMemberChoice stores the user's own provider and model, or clears the
// choice when provider is "". Changes are audited as settings.changed
// (assistant.own_provider and assistant.own_model; never a key).
func (st *Store) SetMemberChoice(ctx context.Context, userID, provider, model string, rec *audit.Recorder) error {
	prev, err := st.MemberChoice(ctx, userID)
	if err != nil {
		return err
	}
	if provider == "" {
		if _, err := st.db.ExecContext(ctx, `DELETE FROM assistant_member_provider WHERE user_id = ?`, userID); err != nil {
			return fmt.Errorf("clear assistant member provider: %w", err)
		}
	} else {
		if err := ValidateMemberChoice(provider, model); err != nil {
			return err
		}
		_, err := st.db.ExecContext(ctx, `INSERT INTO assistant_member_provider(user_id, provider, model, updated_at) VALUES(?,?,?,?)
			ON CONFLICT(user_id) DO UPDATE SET provider = excluded.provider, model = excluded.model, updated_at = excluded.updated_at`,
			userID, provider, model, st.now().UnixMilli())
		if err != nil {
			return fmt.Errorf("store assistant member provider: %w", err)
		}
	}
	if rec != nil {
		var fromP, fromM string
		if prev != nil {
			fromP, fromM = prev.Provider, prev.Model
		}
		if fromP != provider {
			rec.Record(ctx, audit.SettingsChanged(userID, "assistant.own_provider", orServer(fromP), orServer(provider)))
		}
		if fromM != model && provider != "" {
			rec.Record(ctx, audit.SettingsChanged(userID, "assistant.own_model", fromM, model))
		}
	}
	return nil
}

func orServer(p string) string {
	if p == "" {
		return "server"
	}
	return p
}

// CountMemberKeyUsers counts accounts whose turns would use their own
// provider and key right now (shown to the owner).
func (st *Store) CountMemberKeyUsers(ctx context.Context) (int, error) {
	rows, err := st.db.QueryContext(ctx, `SELECT user_id, provider FROM assistant_member_provider`)
	if err != nil {
		return 0, fmt.Errorf("count assistant member providers: %w", err)
	}
	defer rows.Close()
	sec, err := st.secrets.Load()
	if err != nil {
		return 0, err
	}
	n := 0
	for rows.Next() {
		var uid, p string
		if err := rows.Scan(&uid, &p); err != nil {
			return 0, err
		}
		if IsMemberProvider(p) && sec.Has(UserKey(uid, p)) {
			n++
		}
	}
	return n, rows.Err()
}

// Route is what a turn of one user uses: the provider, model and key, and
// whether the key is the user's own. The key is unexported so a Route never
// reaches JSON or logs.
type Route struct {
	Provider string
	Model    string
	// Own is true when the turn runs on the user's own key (their own
	// provider, or the owner's provider with a key they stored before).
	Own bool
	// Member is true when the provider and model are the user's own choice.
	Member bool
	key    string
	base   ProviderSettings
}

// Resolve decides the provider, model and key of a turn of userID (design
// D3): the member's own provider when member keys are allowed, a choice is
// stored and its key is set; otherwise the owner's default provider with the
// operator's key, or the user's own key for that provider as before.
func (st *Store) Resolve(ctx context.Context, userID string, set Settings) (Route, error) {
	sec, err := st.secrets.Load()
	if err != nil {
		return Route{}, err
	}
	if set.AllowMemberKeys {
		choice, err := st.MemberChoice(ctx, userID)
		if err != nil {
			return Route{}, err
		}
		if choice != nil && IsMemberProvider(choice.Provider) && sec.Has(UserKey(userID, choice.Provider)) {
			return Route{Provider: choice.Provider, Model: choice.Model, Own: true, Member: true,
				key: sec.Value(UserKey(userID, choice.Provider)), base: ProviderSettings{Enabled: true, Model: choice.Model}}, nil
		}
	}
	name := set.DefaultProvider
	p := set.Providers[name]
	r := Route{Provider: name, Model: p.Model, base: p}
	if set.AllowMemberKeys && sec.Has(UserKey(userID, name)) {
		r.key, r.Own = sec.Value(UserKey(userID, name)), true
	} else {
		r.key = sec.Value(OperatorKey(name))
	}
	return r, nil
}

// HasKey reports whether the route has a key (the compatible provider may
// run without one).
func (r Route) HasKey() bool { return r.key != "" }

// String, GoString and LogValue keep the key out of fmt and slog output.
func (r Route) String() string {
	return fmt.Sprintf("{provider:%s model:%s own:%t member:%t}", r.Provider, r.Model, r.Own, r.Member)
}

// GoString implements fmt.GoStringer (%#v) without the key.
func (r Route) GoString() string { return "assistant.Route" + r.String() }

// LogValue implements slog.LogValuer without the key.
func (r Route) LogValue() slog.Value {
	return slog.GroupValue(slog.String("provider", r.Provider), slog.String("model", r.Model), slog.Bool("own_key", r.Own), slog.Bool("member_provider", r.Member))
}
