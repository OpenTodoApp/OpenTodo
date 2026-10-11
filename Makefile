VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
LDFLAGS := -s -w -X main.version=$(VERSION)

CLI_PLATFORMS := linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64

EXT_ZIP := dist/opentodo-browser-extension.zip
EXT_FILES := manifest.json background.js share-url.js options.html options.js icons/icon-16.png icons/icon-48.png icons/icon-128.png

.PHONY: all web server cli cli-release cli-smoke extension build run dev test test-go test-web test-extension check lint clean docker openspec-validate layout-check docs docs-check docs-screenshots docs-site-check

all: build

## Build the web app into internal/web/dist (embedded by the Go binary).
web:
	cd web && npm ci --no-audit --no-fund && npm run build

## Build the server binary (expects `make web` to have run).
server:
	CGO_ENABLED=0 go build -trimpath -ldflags="$(LDFLAGS)" -o bin/opentodo ./cmd/opentodo

## Build the `ot` command-line client for this machine (not part of the container image).
cli:
	CGO_ENABLED=0 go build -trimpath -ldflags="$(LDFLAGS)" -o bin/ot ./cmd/ot

## Cross-compile `ot` for every release platform into dist/.
cli-release:
	@mkdir -p dist
	@for p in $(CLI_PLATFORMS); do \
	  os=$${p%/*}; arch=$${p#*/}; ext=""; [ "$$os" = windows ] && ext=.exe; \
	  echo "  ot $$os/$$arch"; \
	  CGO_ENABLED=0 GOOS=$$os GOARCH=$$arch go build -trimpath -ldflags="$(LDFLAGS)" -o dist/ot-$$os-$$arch$$ext ./cmd/ot || exit 1; \
	done

## End-to-end check of the CLI against a freshly started local server.
cli-smoke: server cli
	./scripts/cli-smoke.sh

## Test the browser extension and zip it into dist/ (not part of the container image).
extension: test-extension
	@node -e 'const m = require("./extension/manifest.json"); if (m.host_permissions || m.optional_host_permissions || m.content_scripts) { console.error("extension/manifest.json must not declare host permissions or content scripts"); process.exit(1) }'
	@mkdir -p dist && rm -f $(EXT_ZIP)
	cd extension && zip -q -X ../$(EXT_ZIP) $(EXT_FILES)
	@echo "  $(EXT_ZIP) ($$(wc -c < $(EXT_ZIP)) bytes)"

build: web server

## Layout check (mobile-layout): every screen and overlay at 360/390/768 px in
## Chromium and WebKit against a throwaway server on :18080. Needs Playwright
## (npm i -g playwright@1.56.1 && playwright install chromium webkit);
## ENGINES=chromium limits it to one engine.
layout-check: build
	@d=$$(mktemp -d); OPENTODO_DATA_DIR=$$d OPENTODO_ADDR=127.0.0.1:18080 ./bin/opentodo >$$d/server.log 2>&1 & pid=$$!; \
	  for i in $$(seq 1 30); do curl -fsS 127.0.0.1:18080/healthz >/dev/null 2>&1 && break; sleep 0.3; done; \
	  OPENTODO_URL=http://127.0.0.1:18080 node scripts/e2e-layout.mjs layout-report; s=$$?; kill $$pid; rm -rf $$d; exit $$s

## Run the production binary locally on :8080 with ./data.
run: build
	./bin/opentodo

## Development: Go API on :8080 plus Vite dev server on :5173 with hot reload.
dev:
	@echo "Starting API on :8080 and Vite on :5173 (Ctrl+C stops both)"
	@trap 'kill 0' INT; \
	  go run ./cmd/opentodo & \
	  (cd web && npm run dev) & \
	  wait

test: test-go test-web test-extension

test-go:
	go test ./...

test-web:
	cd web && npm test

test-extension:
	node --test extension/share-url.test.js

lint:
	go vet ./...
	cd web && npm run typecheck

openspec-validate:
	npx --yes @fission-ai/openspec@latest validate --all --strict

## Everything CI runs.
## Documentation (user-documentation): regenerate website/docs/**, the in-app help
## bundle web/src/generated/help.json and the keyboard guide's tables from docs/.
docs:
	cd web && npm run docs:build

## Front matter, links, anchors, images, spec coverage, help ids, generated files.
docs-check:
	cd web && npm run docs:check

## Screenshots of the user guide (docs/images/*.webp, light and dark) from the seeded
## demo data. Needs Playwright with Chromium (CHROMIUM_PATH to use another binary).
DOCS_VERSION := $(shell sed -n 's/^## \[\([0-9][0-9.]*\)\].*/\1/p' CHANGELOG.md | head -1)
docs-screenshots: web
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=$(DOCS_VERSION)" -o bin/opentodo-docs ./cmd/opentodo
	OPENTODO_BIN=bin/opentodo-docs node scripts/docs-screenshots.mjs
	$(MAKE) docs

## Docs website in a browser: sideways scrolling, axe-core, search, no-JS (needs
## Playwright with Chromium and `npm ci` in web/ for axe-core).
docs-site-check:
	node scripts/e2e-docs.mjs docs-report

check: lint test docs-check openspec-validate

docker:
	docker build --build-arg VERSION=$(VERSION) -t opentodo:$(VERSION) .

clean:
	rm -rf bin web/dist internal/web/dist/* && touch internal/web/dist/.gitkeep
