package email

import (
	"bytes"
	"io"
	"strings"
	"unicode/utf8"
)

// charsetReader converts the charsets mime.WordDecoder does not know itself.
// Unknown charsets pass through; toUTF8 replaces invalid bytes afterwards.
func charsetReader(charset string, r io.Reader) (io.Reader, error) {
	data, err := io.ReadAll(io.LimitReader(r, MaxMessageBytes))
	if err != nil {
		return nil, err
	}
	return strings.NewReader(toUTF8(charset, data)), nil
}

// cp1252 maps bytes 0x80-0x9F of windows-1252 (the rest equals ISO-8859-1).
var cp1252 = [32]rune{
	'€', '�', '‚', 'ƒ', '„', '…', '†', '‡', 'ˆ', '‰', 'Š', '‹', 'Œ', '�', 'Ž', '�',
	'�', '‘', '’', '“', '”', '•', '–', '—', '˜', '™', 'š', '›', 'œ', '�', 'ž', 'Ÿ',
}

// toUTF8 decodes text in the common mail charsets: UTF-8, US-ASCII,
// ISO-8859-1, ISO-8859-15, windows-1252 and the single-byte charsets of
// charsets_gen.go (Central European, Cyrillic, Greek, Turkish, Baltic; GitHub
// issue 1309). Anything else is taken as UTF-8 with invalid sequences
// replaced, so the result is always valid UTF-8.
func toUTF8(charset string, b []byte) string {
	label := strings.ToLower(strings.Trim(charset, `" `))
	if table, ok := singleByte[label]; ok {
		return decodeSingleByte(b, table)
	}
	switch label {
	case "iso-8859-1", "iso8859-1", "latin1", "latin-1", "l1", "iso_8859-1",
		"windows-1252", "cp1252", "x-cp1252", "us-ascii", "ascii":
		// Like browsers (WHATWG Encoding), ISO-8859-1 and ASCII labels decode as
		// windows-1252: mail labelled Latin-1 often carries its curly quotes and €.
		if strings.HasSuffix(strings.ToLower(charset), "ascii") && utf8.Valid(b) {
			return string(b)
		}
		return latin(b, true, false)
	case "iso-8859-15", "iso8859-15", "latin9", "latin-9":
		return latin(b, false, true)
	default:
		if utf8.Valid(b) {
			return string(b)
		}
		return string(bytes.ToValidUTF8(b, []byte("�")))
	}
}

func latin(b []byte, win, fifteen bool) string {
	var sb strings.Builder
	sb.Grow(len(b))
	for _, c := range b {
		r := rune(c)
		switch {
		case win && c >= 0x80 && c <= 0x9f:
			r = cp1252[c-0x80]
		case fifteen:
			switch c {
			case 0xa4:
				r = '€'
			case 0xa6:
				r = 'Š'
			case 0xa8:
				r = 'š'
			case 0xb4:
				r = 'Ž'
			case 0xb8:
				r = 'ž'
			case 0xbc:
				r = 'Œ'
			case 0xbd:
				r = 'œ'
			case 0xbe:
				r = 'Ÿ'
			}
		}
		sb.WriteRune(r)
	}
	return sb.String()
}

// decodeSingleByte decodes b in a single-byte charset whose bytes 0x80-0xFF
// are table; bytes below 0x80 are ASCII.
func decodeSingleByte(b []byte, table *[128]rune) string {
	var sb strings.Builder
	sb.Grow(len(b) + len(b)/2)
	for _, c := range b {
		if c < 0x80 {
			sb.WriteByte(c)
		} else {
			sb.WriteRune(table[c-0x80])
		}
	}
	return sb.String()
}
