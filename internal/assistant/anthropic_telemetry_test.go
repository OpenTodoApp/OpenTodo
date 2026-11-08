package assistant

import (
	"context"
	"sync/atomic"
	"testing"

	"github.com/anthropics/anthropic-sdk-go/option"
	"go.opentelemetry.io/otel/trace"
	"go.opentelemetry.io/otel/trace/noop"
)

// countingProvider counts the spans the SDK starts through the tracer provider
// one test injects (testTracerProvider).
type countingProvider struct {
	noop.TracerProvider
	started *atomic.Int32
}

func (p countingProvider) Tracer(string, ...trace.TracerOption) trace.Tracer {
	return countingTracer{started: p.started}
}

type countingTracer struct {
	noop.Tracer
	started *atomic.Int32
}

func (t countingTracer) Start(ctx context.Context, name string, opts ...trace.SpanStartOption) (context.Context, trace.Span) {
	t.started.Add(1)
	return noop.Tracer{}.Start(ctx, name, opts...)
}

// testTracerProvider is an extra option of the client, for tests only: it does
// not exist on a provider built from settings.
func testTracerProvider(p *AnthropicProvider, tp trace.TracerProvider) {
	p.testOptions = []option.RequestOption{option.WithTracerProvider(tp)}
}

// TestAnthropicEmitsNoTelemetry: even with a counting tracer provider injected,
// an assistant turn with telemetry disabled starts no OpenTelemetry span
// (AGENTS.md rule 5).
func TestAnthropicEmitsNoTelemetry(t *testing.T) {
	var started atomic.Int32
	f := newFixture(t)
	srv, _ := fakeAnthropic(t, sse(anthropicStream([]sseBlock{{kind: "text", text: "Hi."}}, "end_turn", 10, 2)))
	p := anthropicFor(srv)
	testTracerProvider(p, countingProvider{started: &started})
	if res, _, _ := run(f, p, "hello"); res.Err != nil {
		t.Fatalf("turn: %+v", res)
	}
	if n := started.Load(); n != 0 {
		t.Fatalf("%d OpenTelemetry spans started", n)
	}
}
