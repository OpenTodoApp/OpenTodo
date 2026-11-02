package settings

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"

	"github.com/OpenTodoApp/opentodo/internal/ids"
	"github.com/OpenTodoApp/opentodo/internal/themes"
)

// The instance's themes (OpenSpec change theme-instance-default, design D1): the
// owner's default light and dark theme and up to MaxInstanceThemes theme
// documents every member can choose. Server state like branding, never an op;
// both keys change in one transaction, and Version grows with every change so
// devices know when to read them again.

const (
	// ThemesDefaultKey holds the default of each side.
	ThemesDefaultKey = "themes.default"
	// ThemesInstanceKey holds the instance themes and the version.
	ThemesInstanceKey = "themes.instance"
	// MaxInstanceThemes is how many instance themes an instance keeps.
	MaxInstanceThemes = 20
)

// Errors of the instance themes, each one refusal code of the routes.
var (
	ErrThemeInvalid  = errors.New("invalid_input")
	ErrThemeTooLarge = errors.New("too_large")
	ErrThemeLimit    = errors.New("limit_reached")
	ErrThemeNotFound = errors.New("not_found")
)

// ThemeInputError is a refused input with a message for the caller.
type ThemeInputError struct {
	Kind error
	Msg  string
}

func (e *ThemeInputError) Error() string { return e.Msg }
func (e *ThemeInputError) Unwrap() error { return e.Kind }

func refuse(kind error, format string, a ...any) error {
	return &ThemeInputError{Kind: kind, Msg: fmt.Sprintf(format, a...)}
}

// ThemeDefault is the default of each side: "" (OpenTodo's), builtin:<id> or instance:<id>.
type ThemeDefault struct {
	Light string `json:"light"`
	Dark  string `json:"dark"`
}

// Side returns the choice of one side.
func (d ThemeDefault) Side(side string) string {
	if side == "dark" {
		return d.Dark
	}
	return d.Light
}

func (d *ThemeDefault) set(side, v string) {
	if side == "dark" {
		d.Dark = v
	} else {
		d.Light = v
	}
}

// InstanceTheme is one instance theme: its server id and its document, whose
// id is the server id.
type InstanceTheme struct {
	ID   string          `json:"id"`
	Kind string          `json:"kind"`
	Doc  json.RawMessage `json:"doc"`
}

// InstanceThemes is everything members read.
type InstanceThemes struct {
	Version int64           `json:"version"`
	Default ThemeDefault    `json:"default"`
	Themes  []InstanceTheme `json:"themes"`
}

type instanceRow struct {
	Version int64           `json:"version"`
	Themes  []InstanceTheme `json:"themes"`
}

var (
	choiceRe = regexp.MustCompile(`^(builtin|instance):([a-z0-9-]{1,64})$`)
	themeID  = regexp.MustCompile(`^[a-z0-9]{1,40}$`)
)

// Themes reads the instance themes; an instance without any reads as version 0.
func (s *Store) Themes(ctx context.Context) (InstanceThemes, error) {
	var row instanceRow
	var def ThemeDefault
	if _, err := s.Get(ctx, ThemesInstanceKey, &row); err != nil {
		return InstanceThemes{}, err
	}
	if _, err := s.Get(ctx, ThemesDefaultKey, &def); err != nil {
		return InstanceThemes{}, err
	}
	if row.Themes == nil {
		row.Themes = []InstanceTheme{}
	}
	return InstanceThemes{Version: row.Version, Default: def, Themes: row.Themes}, nil
}

// updateThemes changes both keys in one transaction through fn, bumping the version.
func (s *Store) updateThemes(ctx context.Context, fn func(*InstanceThemes) error) (InstanceThemes, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return InstanceThemes{}, fmt.Errorf("begin themes: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	read := func(key string, dst any) error {
		var raw sql.NullString
		err := tx.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, key).Scan(&raw)
		if errors.Is(err, sql.ErrNoRows) || (err == nil && !raw.Valid) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("read setting %s: %w", key, err)
		}
		return json.Unmarshal([]byte(raw.String), dst)
	}
	var row instanceRow
	var cur InstanceThemes
	if err := read(ThemesInstanceKey, &row); err != nil {
		return InstanceThemes{}, err
	}
	if err := read(ThemesDefaultKey, &cur.Default); err != nil {
		return InstanceThemes{}, err
	}
	cur.Version, cur.Themes = row.Version, row.Themes
	if cur.Themes == nil {
		cur.Themes = []InstanceTheme{}
	}
	if err := fn(&cur); err != nil {
		return InstanceThemes{}, err
	}
	cur.Version++
	write := func(key string, v any) error {
		raw, err := json.Marshal(v)
		if err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO settings(key, value, updated_at) VALUES(?, ?, ?)
			ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, key, string(raw), s.now().UnixMilli())
		if err != nil {
			return fmt.Errorf("write setting %s: %w", key, err)
		}
		return nil
	}
	if err := write(ThemesInstanceKey, instanceRow{Version: cur.Version, Themes: cur.Themes}); err != nil {
		return InstanceThemes{}, err
	}
	if err := write(ThemesDefaultKey, cur.Default); err != nil {
		return InstanceThemes{}, err
	}
	if err := tx.Commit(); err != nil {
		return InstanceThemes{}, fmt.Errorf("commit themes: %w", err)
	}
	return cur, nil
}

// checkChoice normalises one side's default: "" for OpenTodo's, else a built-in
// or instance theme of that side's kind.
func checkChoice(side, v string, list []InstanceTheme) (string, error) {
	if v == "" {
		return "", nil
	}
	m := choiceRe.FindStringSubmatch(v)
	if m == nil {
		return "", refuse(ErrThemeInvalid, "%s: not a theme choice", side)
	}
	if m[1] == "builtin" {
		kind, ok := themes.Builtin[m[2]]
		if !ok {
			return "", refuse(ErrThemeInvalid, "%s: unknown theme %s", side, m[2])
		}
		if kind != side {
			return "", refuse(ErrThemeInvalid, "%s: %s is a %s theme", side, m[2], kind)
		}
		if themes.DefaultBuiltin[side] == m[2] {
			return "", nil
		}
		return v, nil
	}
	i := slices.IndexFunc(list, func(t InstanceTheme) bool { return t.ID == m[2] })
	if i < 0 {
		return "", refuse(ErrThemeInvalid, "%s: unknown instance theme %s", side, m[2])
	}
	if list[i].Kind != side {
		return "", refuse(ErrThemeInvalid, "%s: %s is a %s theme", side, m[2], list[i].Kind)
	}
	return v, nil
}

// SetThemeDefault sets the default of both sides.
func (s *Store) SetThemeDefault(ctx context.Context, d ThemeDefault) (InstanceThemes, error) {
	return s.updateThemes(ctx, func(cur *InstanceThemes) error {
		var next ThemeDefault
		for _, side := range []string{"light", "dark"} {
			v, err := checkChoice(side, d.Side(side), cur.Themes)
			if err != nil {
				return err
			}
			next.set(side, v)
		}
		cur.Default = next
		return nil
	})
}

// prepareThemeDoc validates a document and gives it the server id: its JSON with
// "id" set, and its kind.
func prepareThemeDoc(doc []byte, id string) (json.RawMessage, string, error) {
	if len(doc) > themes.MaxBytes {
		return nil, "", refuse(ErrThemeTooLarge, "a theme document is at most %d KB", themes.MaxBytes/1024)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(doc, &fields); err != nil || fields == nil {
		return nil, "", refuse(ErrThemeInvalid, "a theme document must be a JSON object")
	}
	fields["id"], _ = json.Marshal(id)
	out, err := json.Marshal(fields)
	if err != nil {
		return nil, "", err
	}
	if err := themes.Validate(out); err != nil {
		if themes.Code(err) == "size" {
			return nil, "", refuse(ErrThemeTooLarge, "a theme document is at most %d KB", themes.MaxBytes/1024)
		}
		return nil, "", refuse(ErrThemeInvalid, "%s", strings.TrimPrefix(err.Error(), "theme document: "))
	}
	var kind string
	_ = json.Unmarshal(fields["kind"], &kind)
	return out, kind, nil
}

// PutInstanceTheme adds a theme (id "new") or replaces one. It returns the
// theme's id and whether it was added.
func (s *Store) PutInstanceTheme(ctx context.Context, id string, doc []byte) (InstanceThemes, string, error) {
	added := id == "new"
	if added {
		id = strings.ReplaceAll(ids.New(), "-", "")[:20]
	} else if !themeID.MatchString(id) {
		return InstanceThemes{}, "", refuse(ErrThemeNotFound, "no such instance theme")
	}
	out, kind, err := prepareThemeDoc(doc, id)
	if err != nil {
		return InstanceThemes{}, "", err
	}
	next, err := s.updateThemes(ctx, func(cur *InstanceThemes) error {
		i := slices.IndexFunc(cur.Themes, func(t InstanceTheme) bool { return t.ID == id })
		if added {
			if len(cur.Themes) >= MaxInstanceThemes {
				return refuse(ErrThemeLimit, "at most %d server themes", MaxInstanceThemes)
			}
			cur.Themes = append(cur.Themes, InstanceTheme{ID: id, Kind: kind, Doc: out})
			return nil
		}
		if i < 0 {
			return refuse(ErrThemeNotFound, "no such instance theme")
		}
		if cur.Themes[i].Kind != kind {
			for _, side := range []string{"light", "dark"} {
				if cur.Default.Side(side) == "instance:"+id {
					return refuse(ErrThemeInvalid, "the theme is the default %s theme, so it stays a %s theme", side, side)
				}
			}
		}
		cur.Themes[i] = InstanceTheme{ID: id, Kind: kind, Doc: out}
		return nil
	})
	return next, id, err
}

// RemoveInstanceTheme removes a theme, clearing a default that names it.
func (s *Store) RemoveInstanceTheme(ctx context.Context, id string) (InstanceThemes, error) {
	return s.updateThemes(ctx, func(cur *InstanceThemes) error {
		i := slices.IndexFunc(cur.Themes, func(t InstanceTheme) bool { return t.ID == id })
		if i < 0 {
			return refuse(ErrThemeNotFound, "no such instance theme")
		}
		cur.Themes = slices.Delete(cur.Themes, i, i+1)
		for _, side := range []string{"light", "dark"} {
			if cur.Default.Side(side) == "instance:"+id {
				cur.Default.set(side, "")
			}
		}
		return nil
	})
}
