package httpapi

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"
)

// A transparent picture (a logo, a cut-out photo) becomes a JPEG on white,
// not on black: JPEG has no transparency, and its transparent pixels are
// (0,0,0,0).
func TestAvatarTransparencyIsWhite(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, avatarSize, avatarSize))
	for y := 96; y < 160; y++ {
		for x := 96; x < 160; x++ {
			img.Set(x, y, color.NRGBA{200, 0, 0, 255})
		}
	}
	var in bytes.Buffer
	if err := png.Encode(&in, img); err != nil {
		t.Fatal(err)
	}
	out, err := decodeAvatar(in.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	got, err := jpeg.Decode(bytes.NewReader(out))
	if err != nil {
		t.Fatal(err)
	}
	if r, g, b, _ := got.At(4, 4).RGBA(); r>>8 < 240 || g>>8 < 240 || b>>8 < 240 {
		t.Fatalf("a transparent corner is %d,%d,%d, want white", r>>8, g>>8, b>>8)
	}
	if r, g, _, _ := got.At(128, 128).RGBA(); r>>8 < 150 || g>>8 > 60 {
		t.Fatalf("the opaque centre is %d,%d, want red", r>>8, g>>8)
	}
}
