// Command ot is the OpenTodo command-line client. It talks to any OpenTodo server
// over the /api/v1 REST API with a bearer token; see docs/cli.md.
//
//	ot login https://todo.example.com
//	ot add "Call the plumber" --due tomorrow --time 09:00 --priority 2
//	ot today
//	ot done 8c2a
//	ot list --json | jq '.[].title'
package main

import (
	"os"

	"github.com/pixari/opentodo/internal/cli"
)

// version is set at build time with -ldflags "-X main.version=...".
var version = "dev"

func main() {
	cli.Version = version
	os.Exit(cli.NewApp().Main(os.Args[1:]))
}
