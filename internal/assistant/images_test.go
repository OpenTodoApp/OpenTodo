package assistant

import (
	"bytes"
	"context"
	"encoding/base64"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// Photos in a turn (OpenSpec change voice-ramble, tasks 2.1–2.6).

// jpegB64 is a tiny JPEG header in base64: enough for the type check.
var jpegB64 = base64.StdEncoding.EncodeToString([]byte{0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, 'J', 'F', 'I', 'F', 0, 1})

func TestCheckImages(t *testing.T) {
	png8 := base64.StdEncoding.EncodeToString([]byte("\x89PNG\r\n\x1a\nrest"))
	webp := base64.StdEncoding.EncodeToString([]byte("RIFF\x00\x00\x00\x00WEBPVP8 "))
	gif := base64.StdEncoding.EncodeToString([]byte("GIF89a...."))
	ok := []Image{{"image/jpeg", jpegB64}, {"image/png", png8}, {"image/webp", webp}, {"image/gif", gif}}
	if err := CheckImages(ok); err != nil {
		t.Fatal(err)
	}
	if err := CheckImages(nil); err != nil {
		t.Fatal(err)
	}
	big := make([]byte, MaxImageBytes+1)
	copy(big, []byte{0xFF, 0xD8, 0xFF})
	cases := []struct {
		name     string
		imgs     []Image
		tooLarge bool
		field    string
	}{
		{"five", append(ok, Image{"image/jpeg", jpegB64}), true, "images:"},
		{"type", []Image{{"image/heic", jpegB64}}, false, "images[0].media_type"},
		{"base64", []Image{{"image/jpeg", "not base64!"}}, false, "images[0].data"},
		{"bytes", []Image{{"image/png", jpegB64}}, false, "images[0].data"},
		{"webp bytes", []Image{{"image/webp", png8}}, false, "images[0].data"},
		{"size", []Image{{"image/jpeg", base64.StdEncoding.EncodeToString(big)}}, true, "images[0]"},
	}
	for _, c := range cases {
		err := CheckImages(c.imgs)
		ie, isImg := err.(*ImageError)
		if !isImg || ie.TooLarge != c.tooLarge || !strings.HasPrefix(ie.Msg, c.field) {
			t.Fatalf("%s: %v", c.name, err)
		}
	}
	// The data never reaches fmt output.
	if s := (Image{"image/jpeg", jpegB64}).GoString(); strings.Contains(s, jpegB64) {
		t.Fatalf("GoString = %s", s)
	}
}

func TestTestImageIsSmallPNG(t *testing.T) {
	raw, err := base64.StdEncoding.DecodeString(testImage.Data)
	if err != nil {
		t.Fatal(err)
	}
	img, err := png.Decode(bytes.NewReader(raw))
	if err != nil || img.Bounds().Dx() != 64 || img.Bounds().Dy() != 32 || CheckImages([]Image{testImage}) != nil {
		t.Fatalf("test image: %v %v", err, img.Bounds())
	}
}

func TestReadsImages(t *testing.T) {
	set := Defaults()
	for _, c := range []struct {
		r      Route
		marked bool
		want   bool
	}{
		{Route{Provider: Anthropic}, false, true},
		{Route{Provider: OpenAI}, false, true},
		{Route{Provider: Gemini, Member: true}, false, true},
		{Route{Provider: Compatible}, false, false},
		{Route{Provider: Compatible}, true, true},
		{Route{Provider: "other"}, true, false},
	} {
		set.Providers[Compatible] = ProviderSettings{Images: c.marked}
		if got := ReadsImages(c.r, set); got != c.want {
			t.Fatalf("%v marked=%v: %v", c.r, c.marked, got)
		}
	}
}

func photoMessages() []Message {
	return foldUntrusted([]Message{{Role: "user", Text: "earlier"}, {Role: "assistant", Text: "ok"},
		{Role: "user", Text: "turn these into tasks", Images: []Image{{MediaType: "image/jpeg", Data: jpegB64}}}})
}

// voice-ramble 2.2: Anthropic receives a base64 image block after the text,
// inside the message that carries the photos note.
func TestAnthropicSendsImageBlocks(t *testing.T) {
	srv, rec := fakeAnthropic(t, sse(anthropicStream([]sseBlock{{kind: "text", text: "Three tasks."}}, "end_turn", 10, 3)))
	_, err := anthropicFor(srv).Start(Request{System: "s", Messages: photoMessages(), MaxTokens: 100}).Next(context.Background(), func(string) {})
	if err != nil {
		t.Fatal(err)
	}
	msgs := rec.bodies[0]["messages"].([]any)
	last := msgs[len(msgs)-1].(map[string]any)["content"].([]any)
	if len(last) != 2 {
		t.Fatalf("content = %v", last)
	}
	text := last[0].(map[string]any)
	img := last[1].(map[string]any)
	src := img["source"].(map[string]any)
	if !strings.Contains(text["text"].(string), ImagesNote) || img["type"] != "image" || src["type"] != "base64" || src["media_type"] != "image/jpeg" || src["data"] != jpegB64 {
		t.Fatalf("blocks = %v", last)
	}
	// Earlier messages carry no image.
	if first := msgs[0].(map[string]any)["content"].([]any); len(first) != 1 {
		t.Fatalf("first = %v", first)
	}
}

// voice-ramble 2.3 and design D11 (refs #501): the Gemini request at Google's
// OpenAI-compatible path carries the tools without type lists, streams, and
// sends the photo as an image part with a data: URL.
func TestGeminiRequestWithImage(t *testing.T) {
	srv, rec := fakeAnthropic(t, sse(chatText("Done.", "stop")))
	p := &ChatProvider{Name: Gemini, BaseURL: srv.URL + "/v1beta/openai", Key: "AIza-TEST", Model: "gemini-x", HTTP: srv.Client(), Backoff: time.Millisecond}
	tool := ToolDef{Name: "create_tasks", Description: "d", Schema: map[string]any{"type": "object", "properties": map[string]any{
		"due": map[string]any{"type": []string{"string", "null"}}}}}
	if _, err := p.Start(Request{System: "s", Messages: photoMessages(), Tools: []ToolDef{tool}, MaxTokens: 100}).Next(context.Background(), func(string) {}); err != nil {
		t.Fatal(err)
	}
	if rec.paths[0] != "/v1beta/openai/chat/completions" || rec.headers[0].Get("Authorization") != "Bearer AIza-TEST" {
		t.Fatalf("path %s", rec.paths[0])
	}
	b := rec.bodies[0]
	if b["stream"] != true || b["tool_choice"] != "auto" {
		t.Fatalf("body = %v", b)
	}
	params := b["tools"].([]any)[0].(map[string]any)["function"].(map[string]any)["parameters"].(map[string]any)
	due := params["properties"].(map[string]any)["due"].(map[string]any)
	if _, isList := due["type"].([]any); isList {
		t.Fatalf("Gemini got a type list: %v", due)
	}
	msgs := b["messages"].([]any)
	parts := msgs[len(msgs)-1].(map[string]any)["content"].([]any)
	if len(parts) != 2 || parts[0].(map[string]any)["type"] != "text" || parts[1].(map[string]any)["type"] != "image_url" ||
		parts[1].(map[string]any)["image_url"].(map[string]any)["url"] != "data:image/jpeg;base64,"+jpegB64 {
		t.Fatalf("parts = %v", parts)
	}
	if _, isText := msgs[1].(map[string]any)["content"].(string); !isText {
		t.Fatalf("an earlier message became parts: %v", msgs[1])
	}
}

// OpenAI and a marked compatible endpoint send the same image parts.
func TestChatImagePartsOpenAIAndCompatible(t *testing.T) {
	for _, name := range []string{OpenAI, Compatible} {
		srv, rec := fakeAnthropic(t, sse(chatText("Done.", "stop")))
		if _, err := chatFor(srv, name).Start(Request{System: "s", Messages: photoMessages()}).Next(context.Background(), func(string) {}); err != nil {
			t.Fatal(err)
		}
		msgs := rec.bodies[0]["messages"].([]any)
		parts, ok := msgs[len(msgs)-1].(map[string]any)["content"].([]any)
		if !ok || len(parts) != 2 {
			t.Fatalf("%s: %v", name, msgs[len(msgs)-1])
		}
	}
}

// Recorded refusals of images (voice-ramble 2.6).
const (
	anthropicImageRefusal = `{"type":"error","error":{"type":"invalid_request_error","message":"messages.0.content.1.image.source.base64: image exceeds 5 MB maximum"}}`
	openAIImageRefusal    = `{"error":{"message":"Invalid content type. image_url is only supported by certain models.","type":"invalid_request_error","param":"messages.[1].content.[1].type","code":null}}`
	geminiImageRefusal    = `[{"error":{"code":400,"message":"Request contains an invalid argument: unable to process input image.","status":"INVALID_ARGUMENT"}}]`
)

func TestImageRefusalsMapToImagesUnsupported(t *testing.T) {
	body := func(s string) func(w http.ResponseWriter, _ map[string]any) {
		return func(w http.ResponseWriter, _ map[string]any) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(400)
			_, _ = io.WriteString(w, s)
		}
	}
	srv, _ := fakeAnthropic(t, body(anthropicImageRefusal))
	_, err := anthropicFor(srv).Start(Request{Messages: photoMessages(), MaxTokens: 10}).Next(context.Background(), func(string) {})
	if pe, ok := AsProviderError(err); !ok || pe.Code != CodeImagesUnsupported || strings.Contains(pe.Error(), "5 MB") {
		t.Fatalf("anthropic: %v", err)
	}
	for name, raw := range map[string]string{OpenAI: openAIImageRefusal, Gemini: geminiImageRefusal} {
		srv, _ := fakeAnthropic(t, body(raw))
		_, err := chatFor(srv, name).Start(Request{Messages: photoMessages()}).Next(context.Background(), func(string) {})
		if pe, ok := AsProviderError(err); !ok || pe.Code != CodeImagesUnsupported || pe.Status != 400 || strings.Contains(pe.Error(), "certain models") {
			t.Fatalf("%s: %v", name, err)
		}
		// Without photos the same answer is an ordinary refusal.
		_, err = chatFor(srv, name).Start(Request{Messages: []Message{{Role: "user", Text: "hi"}}}).Next(context.Background(), func(string) {})
		if pe, ok := AsProviderError(err); !ok || pe.Code != CodeProviderError {
			t.Fatalf("%s without photos: %v", name, err)
		}
	}
}

// voice-ramble 2.4: a compatible endpoint marked as reading images is also
// sent the built-in image, and its refusal is named.
func TestTestConnectionSendsImageWhenMarked(t *testing.T) {
	var images int
	refuse := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		if strings.Contains(string(raw), `"image_url"`) {
			images++
			if refuse {
				w.WriteHeader(400)
				_, _ = io.WriteString(w, `{"error":{"message":"this model does not support image input","type":"invalid_request_error"}}`)
				return
			}
		}
		_, _ = io.WriteString(w, chatText("milk", "stop"))
	}))
	defer srv.Close()
	svc := NewService(newTestStore(t), nil)
	svc.Backoff = time.Millisecond
	set := compatibleSettings(srv.URL+"/v1", true)
	if got := svc.TestConnection(context.Background(), Compatible, set, Draft{}); !got.OK || images != 0 {
		t.Fatalf("unmarked: %+v, %d image requests", got, images)
	}
	on := true
	if got := svc.TestConnection(context.Background(), Compatible, set, Draft{Images: &on}); !got.OK || images != 1 || !strings.Contains(got.Message, "images") {
		t.Fatalf("marked on screen: %+v, %d image requests", got, images)
	}
	refuse = true
	c := set.Providers[Compatible]
	c.Images = true
	set.Providers[Compatible] = c
	got := svc.TestConnection(context.Background(), Compatible, set, Draft{})
	if got.OK || got.Code != CodeImagesUnsupported || !strings.Contains(got.Message, "refused the image") {
		t.Fatalf("refused: %+v", got)
	}
}

// voice-ramble 2.7: a consent to the first disclosure still counts.
func TestEarlierDisclosureStillCounts(t *testing.T) {
	for v, want := range map[int]bool{0: false, 1: true, DisclosureVersion: true, DisclosureVersion + 1: false} {
		c := &Consent{DisclosureVersion: v, Provider: Anthropic}
		if c.Valid(Anthropic) != want {
			t.Fatalf("version %d: %v", v, !want)
		}
	}
	// Only the compatible provider takes the images mark.
	s := Defaults()
	s.Providers[OpenAI] = ProviderSettings{Model: "gpt", Images: true}
	if err := s.validateStatic(); err == nil || !strings.Contains(err.Error(), "providers.openai.images") {
		t.Fatalf("err = %v", err)
	}
}
