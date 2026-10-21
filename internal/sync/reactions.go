package sync

import (
	"encoding/json"
	"slices"
)

// Reactions on comments (OpenSpec change editor-everywhere, design D8). Each
// account's list is its own op field (`reactions.<account id>`); every reader
// that presents a comment to people or programs (REST, export) shows them as
// one `reactions` object from reaction name to the accounts that chose it, plus
// `my_reactions`, the viewer's own list.

// FoldReactions returns a copy of a comment with its `reactions.<account>` keys
// replaced by `reactions` (name → sorted account ids, every name of
// ReactionNames present) and `my_reactions` (the viewer's names, in
// ReactionNames order). The caller's entity is not modified.
func FoldReactions(e Entity, viewer string) Entity {
	if e == nil {
		return nil
	}
	out := make(Entity, len(e)+2)
	byName := make(map[string][]string, len(ReactionNames))
	for _, name := range ReactionNames {
		byName[name] = []string{}
	}
	mine := []string{}
	for k, v := range e {
		account, ok := ReactionAccount(k)
		if !ok {
			out[k] = v
			continue
		}
		var names []string
		if json.Unmarshal(v, &names) != nil {
			continue
		}
		for _, name := range names {
			if _, known := byName[name]; known {
				byName[name] = append(byName[name], account)
				if account == viewer {
					mine = append(mine, name)
				}
			}
		}
	}
	for name := range byName {
		slices.Sort(byName[name])
	}
	slices.SortFunc(mine, func(a, b string) int { return slices.Index(ReactionNames, a) - slices.Index(ReactionNames, b) })
	out["reactions"], _ = json.Marshal(byName)
	out["my_reactions"], _ = json.Marshal(mine)
	return out
}

// FoldAllReactions applies FoldReactions to a list of comments.
func FoldAllReactions(list []Entity, viewer string) []Entity {
	out := make([]Entity, len(list))
	for i, e := range list {
		out[i] = FoldReactions(e, viewer)
	}
	return out
}
