package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"runtime"
	"strings"
	"time"

	"golang.org/x/crypto/argon2"
)

// Argon2id parameters following the OWASP minimum recommendation (19 MiB, t=2, p=1).
// Chosen so a Raspberry Pi can verify a login in well under a second.
const (
	argonTime    = 2
	argonMemory  = 19 * 1024
	argonThreads = 1
	argonKeyLen  = 32
	saltLen      = 16
)

// argonKey derives an argon2id key; a variable so tests can count derivations.
var argonKey = argon2.IDKey

// MaxPasswordLength is the longest password, in bytes, that may be set or
// checked. Sign-in refuses a longer one without hashing it.
const MaxPasswordLength = 1024

// ErrBusy is returned when every password-hashing slot stayed taken for
// hashWait: the request should be retried shortly (HTTP 503 busy).
var ErrBusy = errors.New("the server is busy, try again in a moment")

// Each hash holds argonMemory (19 MiB) for its duration, so concurrent hashes
// are bounded: twice the usable CPUs, at least two (SEC-5).
var (
	hashSlots = make(chan struct{}, max(2, 2*runtime.GOMAXPROCS(0)))
	hashWait  = time.Second
)

// dummyHash is verified in place of a missing or unusable hash, so the time
// taken does not reveal whether an account exists or has a password.
const dummyHash = "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

// withHashSlot runs fn while holding a hashing slot, waiting at most hashWait.
func withHashSlot(fn func()) error {
	select {
	case hashSlots <- struct{}{}:
	default:
		t := time.NewTimer(hashWait)
		defer t.Stop()
		select {
		case hashSlots <- struct{}{}:
		case <-t.C:
			return ErrBusy
		}
	}
	defer func() { <-hashSlots }()
	fn()
	return nil
}

// HashPassword returns a PHC-formatted argon2id hash.
func HashPassword(password string) (string, error) {
	salt := make([]byte, saltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	var key []byte
	if err := withHashSlot(func() { key = argonKey([]byte(password), salt, argonTime, argonMemory, argonThreads, argonKeyLen) }); err != nil {
		return "", err
	}
	return fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s",
		argonMemory, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key)), nil
}

// VerifyPassword reports whether password matches the PHC hash. A hash that is
// not a usable argon2id hash (an account without a password) never matches,
// but the dummy hash is verified instead so it takes the same time. A password
// over MaxPasswordLength never matches and is not hashed. ErrBusy means no
// hashing slot became free in time.
func VerifyPassword(hash, password string) (bool, error) {
	if len(password) > MaxPasswordLength {
		return false, nil
	}
	salt, want, m, t, p, ok := parseHash(hash)
	if !ok {
		salt, want, m, t, p, _ = parseHash(dummyHash)
	}
	var got []byte
	if err := withHashSlot(func() { got = argonKey([]byte(password), salt, t, m, p, uint32(len(want))) }); err != nil {
		return false, err
	}
	return ok && subtle.ConstantTimeCompare(got, want) == 1, nil
}

// parseHash splits a PHC argon2id hash into its salt, key and parameters.
func parseHash(hash string) (salt, key []byte, m, t uint32, p uint8, ok bool) {
	parts := strings.Split(hash, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return nil, nil, 0, 0, 0, false
	}
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &m, &t, &p); err != nil {
		return nil, nil, 0, 0, 0, false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return nil, nil, 0, 0, 0, false
	}
	key, err = base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(key) == 0 {
		return nil, nil, 0, 0, 0, false
	}
	return salt, key, m, t, p, true
}

// ErrWeakPassword is returned when a password does not meet the minimum length.
var ErrWeakPassword = errors.New("password must be at least 10 characters")

// CheckPasswordPolicy enforces the minimum password length.
func CheckPasswordPolicy(password string) error {
	if len(password) < 10 {
		return ErrWeakPassword
	}
	if len(password) > MaxPasswordLength {
		return errors.New("password too long")
	}
	return nil
}
