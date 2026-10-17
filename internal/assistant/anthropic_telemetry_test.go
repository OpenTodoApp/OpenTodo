package assistant

import (
	"context"
	"sync/atomic"
	"testing"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/trace"
	"go.opentelemetry.io/otel/trace/noop"
)

// countingProvider counts the spans the SDK starts through the global provider.
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

// TestAnthropicEmitsNoTelemetry: even with a tracer provider registered
// globally, an assistant turn starts no OpenTelemetry span (AGENTS.md rule 5).
func TestAnthropicEmitsNoTelemetry(t *testing.T) {
	var started atomic.Int32
	prev := otel.GetTracerProvider()
	otel.SetTracerProvider(countingProvider{started: &started})
	t.Cleanup(func() { otel.SetTracerProvider(prev) })

	f := newFixture(t)
	srv, _ := fakeAnthropic(t, sse(anthropicStream([]sseBlock{{kind: "text", text: "Hi."}}, "end_turn", 10, 2)))
	if res, _, _ := run(f, anthropicFor(srv), "hello"); res.Err != nil {
		t.Fatalf("turn: %+v", res)
	}
	if n := started.Load(); n != 0 {
		t.Fatalf("%d OpenTelemetry spans started", n)
	}
}
