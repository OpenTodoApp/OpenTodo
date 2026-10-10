VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
LDFLAGS := -s -w -X main.version=$(VERSION)

.PHONY: all web server build run dev test test-go test-web check lint clean docker openspec-validate

all: build

## Build the web app into internal/web/dist (embedded by the Go binary).
web:
	cd web && npm ci --no-audit --no-fund && npm run build

## Build the server binary (expects `make web` to have run).
server:
	CGO_ENABLED=0 go build -trimpath -ldflags="$(LDFLAGS)" -o bin/opentodo ./cmd/opentodo

build: web server

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

test: test-go test-web

test-go:
	go test ./...

test-web:
	cd web && npm test

lint:
	go vet ./...
	cd web && npm run typecheck

openspec-validate:
	npx --yes @fission-ai/openspec@latest validate --all --strict

## Everything CI runs.
check: lint test openspec-validate

docker:
	docker build --build-arg VERSION=$(VERSION) -t opentodo:$(VERSION) .

clean:
	rm -rf bin web/dist internal/web/dist/* && touch internal/web/dist/.gitkeep
