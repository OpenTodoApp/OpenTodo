package main

import (
	"encoding/json"
	"io"

	"github.com/pixari/opentodo/internal/importer"
)

// printFormats writes the identifiers of the import formats this binary
// accepts, as a JSON array (`opentodo --print-formats`, used by the site bundle).
func printFormats(w io.Writer) error {
	return json.NewEncoder(w).Encode(importer.ProfileNames())
}
