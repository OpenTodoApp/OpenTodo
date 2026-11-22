package imgfit

import (
	"image"
	"image/color"
	"testing"
)

func solid(w, h int, c color.RGBA) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.SetRGBA(x, y, c)
		}
	}
	return img
}

func TestSquareCropsAndScales(t *testing.T) {
	// A 400×300 image, red on the left third and blue elsewhere: the centre
	// square (x 50..350) is red up to x≈133 and blue after.
	img := solid(400, 300, color.RGBA{0, 0, 255, 255})
	for y := 0; y < 300; y++ {
		for x := 0; x < 133; x++ {
			img.SetRGBA(x, y, color.RGBA{255, 0, 0, 255})
		}
	}
	out := Square(img, 256)
	if out.Rect.Dx() != 256 || out.Rect.Dy() != 256 {
		t.Fatalf("size %v", out.Rect)
	}
	if c := out.RGBAAt(10, 128); c.R < 250 || c.B > 5 {
		t.Fatalf("left is %v, want red", c)
	}
	if c := out.RGBAAt(245, 128); c.B < 250 || c.R > 5 {
		t.Fatalf("right is %v, want blue", c)
	}
	// Downscale averages: a checkerboard of black and white becomes grey.
	cb := image.NewRGBA(image.Rect(0, 0, 64, 64))
	for y := 0; y < 64; y++ {
		for x := 0; x < 64; x++ {
			v := uint8(0)
			if (x+y)%2 == 0 {
				v = 255
			}
			cb.SetRGBA(x, y, color.RGBA{v, v, v, 255})
		}
	}
	if c := Square(cb, 8).RGBAAt(3, 3); c.R < 120 || c.R > 135 {
		t.Fatalf("checkerboard averaged to %v", c)
	}
	// Upscale keeps a solid colour solid and stays opaque.
	if c := Square(solid(10, 10, color.RGBA{10, 200, 30, 255}), 64).RGBAAt(40, 40); c != (color.RGBA{10, 200, 30, 255}) {
		t.Fatalf("upscaled %v", c)
	}
}

func TestPadAndFlatten(t *testing.T) {
	logo := solid(100, 100, color.RGBA{255, 0, 0, 255})
	out := Pad(logo, 100, 0.8, color.RGBA{0, 0, 0, 255})
	if c := out.RGBAAt(2, 2); c != (color.RGBA{0, 0, 0, 255}) {
		t.Fatalf("corner %v, want background", c)
	}
	if c := out.RGBAAt(50, 50); c.R < 250 {
		t.Fatalf("centre %v, want logo", c)
	}
	clear := solid(4, 4, color.RGBA{})
	if c := Flatten(clear, color.White).RGBAAt(1, 1); c.A != 255 || c.R != 255 {
		t.Fatalf("flattened %v", c)
	}
}
