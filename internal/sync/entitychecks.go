package sync

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"unicode/utf8"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
)

// Entity-specific value rules Validate adds to the field kinds.

// MaxSlotTasks caps the tasks one slot lists (calendar-slots D1).
const MaxSlotTasks = 20

// MaxSlotMinutes is the longest slot the server accepts (calendar-slots D1:
// clients offer 15 to 480 minutes; the server checks the kind and one day).
const MaxSlotMinutes = 1440

// checkSlot adds the slot rules to the kinds: at most MaxSlotTasks task ids
// and a length that is set and at most one day.
func checkSlot(field string, raw json.RawMessage) error {
	switch field {
	case "task_ids":
		if len(idList(raw)) > MaxSlotTasks {
			return fmt.Errorf("may hold at most %d tasks", MaxSlotTasks)
		}
	case "minutes":
		var n int64
		if json.Unmarshal(raw, &n) != nil || n < 1 || n > MaxSlotMinutes {
			return fmt.Errorf("must be an integer from 1 to %d", MaxSlotMinutes)
		}
	}
	return nil
}

// MaxAttachmentName is the longest attachment name (characters).
const MaxAttachmentName = 255

// checkAttachment adds the attachment rules (design D1): a name of 1–255
// characters without path separators, a link only over http or https, a size
// that is a non-negative whole number. Ciphertext (encrypted accounts) is
// opaque and only length-checked by the value limit.
func checkAttachment(field string, raw json.RawMessage) error {
	switch field {
	case "name":
		var s string
		_ = json.Unmarshal(raw, &s)
		if e2ee.IsCiphertext(s) {
			return nil
		}
		if n := utf8.RuneCountInString(s); n < 1 || n > MaxAttachmentName || strings.ContainsAny(s, "/\\\x00") {
			return errors.New("must be 1–255 characters without / or \\")
		}
	case "url":
		var s string
		if string(raw) == "null" || json.Unmarshal(raw, &s) != nil || e2ee.IsCiphertext(s) {
			return nil
		}
		u, err := url.Parse(s)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			return errors.New("must be an http or https URL")
		}
	case "size":
		var n float64
		_ = json.Unmarshal(raw, &n)
		if n < 0 || n != float64(int64(n)) {
			return errors.New("must be a whole number of bytes")
		}
	}
	return nil
}
