package websign

import (
	"strconv"
	"strings"
)

// ValidVersion reports whether v is a semantic version (MAJOR.MINOR.PATCH with
// an optional pre-release and build), without a leading "v".
func ValidVersion(v string) bool {
	_, ok := parseVersion(v)
	return ok
}

// CompareVersions orders two versions by semantic version precedence:
// -1, 0 or 1. Build metadata is ignored ("1.0.0+a" equals "1.0.0+b"), a
// pre-release is lower than its release ("1.0.0-rc.2" < "1.0.0"), numeric
// identifiers compare as numbers and are lower than alphanumeric ones. A
// version that does not parse is lower than every one that does; two that do
// not parse are equal. The worker's compareVersions (web/src/lib/appCode.ts)
// is the same rule, pinned by the shared vectors.
func CompareVersions(a, b string) int {
	va, okA := parseVersion(a)
	vb, okB := parseVersion(b)
	switch {
	case !okA && !okB:
		return 0
	case !okA:
		return -1
	case !okB:
		return 1
	}
	for i := 0; i < 3; i++ {
		if c := cmpInt(va.core[i], vb.core[i]); c != 0 {
			return c
		}
	}
	switch {
	case len(va.pre) == 0 && len(vb.pre) == 0:
		return 0
	case len(va.pre) == 0:
		return 1
	case len(vb.pre) == 0:
		return -1
	}
	for i := 0; i < len(va.pre) && i < len(vb.pre); i++ {
		if c := cmpIdent(va.pre[i], vb.pre[i]); c != 0 {
			return c
		}
	}
	return cmpInt(uint64(len(va.pre)), uint64(len(vb.pre)))
}

type version struct {
	core [3]uint64
	pre  []string
}

func parseVersion(v string) (version, bool) {
	var out version
	if i := strings.IndexByte(v, '+'); i >= 0 {
		if !validIdents(v[i+1:], false) {
			return out, false
		}
		v = v[:i]
	}
	if i := strings.IndexByte(v, '-'); i >= 0 {
		if !validIdents(v[i+1:], true) {
			return out, false
		}
		out.pre = strings.Split(v[i+1:], ".")
		v = v[:i]
	}
	parts := strings.Split(v, ".")
	if len(parts) != 3 {
		return out, false
	}
	for i, p := range parts {
		if !numeric(p) || (len(p) > 1 && p[0] == '0') {
			return out, false
		}
		n, err := strconv.ParseUint(p, 10, 64)
		if err != nil {
			return out, false
		}
		out.core[i] = n
	}
	return out, true
}

func validIdents(s string, pre bool) bool {
	if s == "" {
		return false
	}
	for _, id := range strings.Split(s, ".") {
		if id == "" {
			return false
		}
		for _, c := range id {
			if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c == '-') {
				return false
			}
		}
		if pre && numeric(id) && len(id) > 1 && id[0] == '0' {
			return false
		}
	}
	return true
}

func numeric(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

func cmpIdent(a, b string) int {
	na, nb := numeric(a), numeric(b)
	switch {
	case na && nb:
		if len(a) != len(b) {
			return cmpInt(uint64(len(a)), uint64(len(b)))
		}
		return strings.Compare(a, b)
	case na:
		return -1
	case nb:
		return 1
	}
	return strings.Compare(a, b)
}

func cmpInt(a, b uint64) int {
	switch {
	case a < b:
		return -1
	case a > b:
		return 1
	}
	return 0
}
