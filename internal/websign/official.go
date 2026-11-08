package websign

import (
	_ "embed"
	"encoding/json"
	"sync"
)

// officialJSON is the official key set (design D3): the public keys of the
// release key and the recovery key, and the switch from report-only to
// refusal. The web build reads the same file (web/vite.config.ts,
// web/scripts/app-manifest.mjs) for the keys built into the service worker.
//
//go:embed release-keys.json
var officialJSON []byte

// Official is release-keys.json.
type Official struct {
	Refuse bool  `json:"refuse"`
	Keys   []Key `json:"keys"`
}

var official = sync.OnceValue(func() Official {
	var o Official
	if err := json.Unmarshal(officialJSON, &o); err != nil {
		panic("websign: release-keys.json: " + err.Error())
	}
	return o
})

// OfficialKeys returns the official key set.
func OfficialKeys() Official { return official() }

// IsOfficial reports whether a full fingerprint is one of the official keys.
func IsOfficial(fingerprint string) bool {
	for _, k := range official().Keys {
		if _, der, err := PublicKey(k.SPKI); err == nil && Fingerprint(der) == fingerprint {
			return true
		}
	}
	return false
}

// KeySPKIs lists the key set's public keys.
func (o Official) KeySPKIs() []string {
	out := make([]string, 0, len(o.Keys))
	for _, k := range o.Keys {
		out = append(out, k.SPKI)
	}
	return out
}
