package quickadd

import (
	"sort"
	"strings"
)

// Links in a quick-add line (OpenSpec change quick-add-links, D1): an http or
// https URL that starts a token becomes a link attachment of the new task and
// leaves the title. Read only with Context.Links; links.ts is the same rule.

// MaxLinks is how many links one line attaches; later ones stay in the title.
const MaxLinks = 5

// matchLink returns the URL a token starts with, without the sentence
// punctuation after it, or "" when the token is not a link.
func matchLink(text string) string {
	lower := strings.ToLower(text)
	if !strings.HasPrefix(lower, "http://") && !strings.HasPrefix(lower, "https://") {
		return ""
	}
	url := text
	for len(url) > 0 {
		c := url[len(url)-1]
		if strings.IndexByte(".,;:!?", c) >= 0 ||
			c == ')' && strings.Count(url, "(") < strings.Count(url, ")") ||
			c == ']' && strings.Count(url, "[") < strings.Count(url, "]") {
			url = url[:len(url)-1]
			continue
		}
		break
	}
	if hostOf(url) == "" {
		return ""
	}
	return url
}

// hostOf is the host of a URL that has "://": without a user, a port or
// "www.", with ASCII letters lowercased (links.ts lowercases the same way).
func hostOf(url string) string {
	rest := url[strings.Index(url, "://")+3:]
	if end := strings.IndexAny(rest, "/?#"); end >= 0 {
		rest = rest[:end]
	}
	rest = rest[strings.LastIndexByte(rest, '@')+1:]
	if strings.HasPrefix(rest, "[") {
		if end := strings.IndexByte(rest, ']'); end >= 0 {
			rest = rest[:end+1]
		}
	} else if h, _, ok := strings.Cut(rest, ":"); ok {
		rest = h
	}
	b := []byte(rest)
	for i, c := range b {
		if 'A' <= c && c <= 'Z' {
			b[i] = c + 'a' - 'A'
		}
	}
	return strings.TrimPrefix(string(b), "www.")
}

// LinkHost is what a link chip reads: the host of a link token (sentence
// punctuation after the URL is not part of it), "" for no link.
func LinkHost(token string) string {
	if url := matchLink(token); url != "" {
		return hostOf(url)
	}
	return ""
}

// findLinks lists the first MaxLinks unquoted link tokens by index: the URL
// and the whole token's span, which leaves the title with any punctuation.
func findLinks(line string, tokens []token) map[int]found {
	out := map[int]found{}
	for i, t := range tokens {
		if len(out) == MaxLinks {
			break
		}
		if t.quoted {
			continue
		}
		if url := matchLink(t.text); url != "" {
			out[i] = found{url, spanOf(line, tokens, i, i+1), true}
		}
	}
	return out
}

// withLinks removes the link tokens from the title and returns the URLs in line
// order. A line that would be left without a title keeps its links as text
// (quick-add-links D2): p.links is cleared, so they are not marks either.
func (p *parser) withLinks(title string, remove, quotes []Span) (string, []string) {
	if len(p.links) == 0 {
		return title, nil
	}
	idx := make([]int, 0, len(p.links))
	for i := range p.links {
		idx = append(idx, i)
	}
	sort.Ints(idx)
	urls := make([]string, 0, len(idx))
	all := append([]Span(nil), remove...)
	for _, i := range idx {
		urls = append(urls, p.links[i].value)
		all = append(all, p.links[i].span)
	}
	if t := stripSpans(p.line, all, quotes); t != "" {
		return t, urls
	}
	p.links = nil
	return title, nil
}
