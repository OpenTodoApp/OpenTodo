// Package imgfit scales images the server stores: profile pictures from a
// sign-in provider and the owner's logo. Standard library only (no x/image):
// a centre crop to a square and an area-averaging downscale, which is what
// photos and logos need; an image smaller than the target is enlarged with
// bilinear sampling. Nothing here reads metadata.
package imgfit

import (
	"image"
	"image/color"
	"image/draw"
)

// Square returns img cropped to its centre square and scaled to size×size.
func Square(img image.Image, size int) *image.RGBA {
	b := img.Bounds()
	side := min(b.Dx(), b.Dy())
	x0 := b.Min.X + (b.Dx()-side)/2
	y0 := b.Min.Y + (b.Dy()-side)/2
	return Scale(img, image.Rect(x0, y0, x0+side, y0+side), size, size)
}

// Scale resamples the region src of img to w×h. A region larger than the target
// is box-filtered (every source pixel weighs by the area it covers), a smaller
// one is sampled bilinearly.
func Scale(img image.Image, src image.Rectangle, w, h int) *image.RGBA {
	out := image.NewRGBA(image.Rect(0, 0, w, h))
	if src.Empty() || w <= 0 || h <= 0 {
		return out
	}
	// Premultiplied float channels of the source region, once.
	sw, sh := src.Dx(), src.Dy()
	px := make([]float64, sw*sh*4)
	at := rgbaAt(img)
	for y := 0; y < sh; y++ {
		for x := 0; x < sw; x++ {
			r, g, b, a := at(src.Min.X+x, src.Min.Y+y)
			i := (y*sw + x) * 4
			px[i], px[i+1], px[i+2], px[i+3] = float64(r), float64(g), float64(b), float64(a)
		}
	}
	if sw >= w && sh >= h {
		boxDown(px, sw, sh, out)
	} else {
		bilinear(px, sw, sh, out)
	}
	return out
}

// rgbaAt reads 16-bit premultiplied channels, with a fast path for RGBA images.
func rgbaAt(img image.Image) func(x, y int) (r, g, b, a uint32) {
	if m, ok := img.(*image.RGBA); ok {
		return func(x, y int) (uint32, uint32, uint32, uint32) {
			i := m.PixOffset(x, y)
			s := m.Pix[i : i+4 : i+4]
			return uint32(s[0]) * 0x101, uint32(s[1]) * 0x101, uint32(s[2]) * 0x101, uint32(s[3]) * 0x101
		}
	}
	return func(x, y int) (uint32, uint32, uint32, uint32) { return img.At(x, y).RGBA() }
}

// boxDown averages every source pixel into the target pixels it covers.
func boxDown(px []float64, sw, sh int, out *image.RGBA) {
	w, h := out.Rect.Dx(), out.Rect.Dy()
	acc := make([]float64, w*h*4)
	weight := make([]float64, w*h)
	fx, fy := float64(w)/float64(sw), float64(h)/float64(sh)
	for sy := 0; sy < sh; sy++ {
		y0, y1 := float64(sy)*fy, float64(sy+1)*fy
		for sx := 0; sx < sw; sx++ {
			x0, x1 := float64(sx)*fx, float64(sx+1)*fx
			i := (sy*sw + sx) * 4
			for ty := int(y0); ty < h && float64(ty) < y1; ty++ {
				cy := overlap(y0, y1, float64(ty), float64(ty+1))
				for tx := int(x0); tx < w && float64(tx) < x1; tx++ {
					wgt := cy * overlap(x0, x1, float64(tx), float64(tx+1))
					if wgt <= 0 {
						continue
					}
					o := ty*w + tx
					acc[o*4] += px[i] * wgt
					acc[o*4+1] += px[i+1] * wgt
					acc[o*4+2] += px[i+2] * wgt
					acc[o*4+3] += px[i+3] * wgt
					weight[o] += wgt
				}
			}
		}
	}
	for o := 0; o < w*h; o++ {
		if weight[o] == 0 {
			continue
		}
		set(out, o%w, o/w, acc[o*4]/weight[o], acc[o*4+1]/weight[o], acc[o*4+2]/weight[o], acc[o*4+3]/weight[o])
	}
}

func overlap(a0, a1, b0, b1 float64) float64 { return max(0, min(a1, b1)-max(a0, b0)) }

// bilinear samples the source at the centre of every target pixel.
func bilinear(px []float64, sw, sh int, out *image.RGBA) {
	w, h := out.Rect.Dx(), out.Rect.Dy()
	for ty := 0; ty < h; ty++ {
		sy := (float64(ty)+0.5)*float64(sh)/float64(h) - 0.5
		y0 := int(max(0, sy))
		y1 := min(y0+1, sh-1)
		wy := max(0, sy-float64(y0))
		for tx := 0; tx < w; tx++ {
			sx := (float64(tx)+0.5)*float64(sw)/float64(w) - 0.5
			x0 := int(max(0, sx))
			x1 := min(x0+1, sw-1)
			wx := max(0, sx-float64(x0))
			var c [4]float64
			for ch := 0; ch < 4; ch++ {
				p00, p10 := px[(y0*sw+x0)*4+ch], px[(y0*sw+x1)*4+ch]
				p01, p11 := px[(y1*sw+x0)*4+ch], px[(y1*sw+x1)*4+ch]
				c[ch] = (p00*(1-wx)+p10*wx)*(1-wy) + (p01*(1-wx)+p11*wx)*wy
			}
			set(out, tx, ty, c[0], c[1], c[2], c[3])
		}
	}
}

// set writes 16-bit premultiplied channels as an 8-bit pixel.
func set(out *image.RGBA, x, y int, r, g, b, a float64) {
	to8 := func(v float64) uint8 { return uint8(min(255, max(0, v/0x101+0.5))) }
	i := out.PixOffset(x, y)
	out.Pix[i], out.Pix[i+1], out.Pix[i+2], out.Pix[i+3] = to8(r), to8(g), to8(b), to8(a)
}

// Pad draws img scaled to fit fraction of a size×size square, centred on bg:
// the "maskable" form of an app icon, whose safe zone is the inner 80 percent.
func Pad(img image.Image, size int, fraction float64, bg color.Color) *image.RGBA {
	out := image.NewRGBA(image.Rect(0, 0, size, size))
	draw.Draw(out, out.Rect, image.NewUniform(bg), image.Point{}, draw.Src)
	inner := int(float64(size) * fraction)
	if inner <= 0 {
		return out
	}
	fitted := Square(img, inner)
	off := (size - inner) / 2
	draw.Draw(out, image.Rect(off, off, off+inner, off+inner), fitted, image.Point{}, draw.Over)
	return out
}

// Flatten draws img over bg, so a transparent logo gets a solid background
// where a format or a client has none.
func Flatten(img image.Image, bg color.Color) *image.RGBA {
	out := image.NewRGBA(img.Bounds())
	draw.Draw(out, out.Rect, image.NewUniform(bg), image.Point{}, draw.Src)
	draw.Draw(out, out.Rect, img, img.Bounds().Min, draw.Over)
	return out
}
