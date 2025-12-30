#!/usr/bin/env python3
"""Generate favicon assets for the web (index.html).

Outputs (repo root):
- favicon.ico
- favicon-16x16.png
- favicon-32x32.png
- apple-touch-icon.png

Design: rounded-square gradient background + simplified browser tab with a 2x2 tile grid.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT_DIR = Path(__file__).resolve().parents[1]


def _lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def _make_diagonal_gradient(size: int, start: tuple[int, int, int], end: tuple[int, int, int]) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()

    denom = 2 * (size - 1) if size > 1 else 1
    for y in range(size):
        for x in range(size):
            t = (x + y) / denom
            px[x, y] = (
                _lerp(start[0], end[0], t),
                _lerp(start[1], end[1], t),
                _lerp(start[2], end[2], t),
                255,
            )

    return img


def _rounded_square_mask(size: int, radius: float) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def create_base_icon(size: int = 512) -> Image.Image:
    start = (14, 165, 233)  # #0EA5E9
    end = (99, 102, 241)  # #6366F1

    bg = _make_diagonal_gradient(size, start, end)

    mask = _rounded_square_mask(size, radius=size * 0.22)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    img.paste(bg, (0, 0), mask)

    # Subtle highlight (top-left)
    highlight = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    hpx = highlight.load()
    for y in range(size):
        for x in range(size):
            t = 1.0 - ((x / (size - 1)) * 0.75 + (y / (size - 1)) * 0.75)
            if t <= 0:
                continue
            alpha = int(55 * min(1.0, t))
            hpx[x, y] = (255, 255, 255, alpha)
    img = Image.alpha_composite(img, Image.composite(highlight, Image.new("RGBA", (size, size)), mask))

    # Foreground: simplified browser tab
    tab_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    tab_draw = ImageDraw.Draw(tab_layer)

    tab_left = size * 0.18
    tab_right = size * 0.82
    tab_top = size * 0.30
    tab_bottom = size * 0.80

    header_left = tab_left
    header_right = size * 0.58
    header_top = size * 0.22
    header_bottom = size * 0.36

    tab_radius = size * 0.10
    header_radius = size * 0.09

    # Shadow
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_color = (0, 0, 0, 90)

    shadow_draw.rounded_rectangle(
        [tab_left, tab_top, tab_right, tab_bottom],
        radius=tab_radius,
        fill=shadow_color,
    )
    shadow_draw.rounded_rectangle(
        [header_left, header_top, header_right, header_bottom],
        radius=header_radius,
        fill=shadow_color,
    )

    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=size * 0.02))

    shadow_offset = int(size * 0.02)
    img.alpha_composite(shadow, (0, shadow_offset))

    # Main tab
    tab_color = (255, 255, 255, 245)
    tab_draw.rounded_rectangle(
        [tab_left, tab_top, tab_right, tab_bottom],
        radius=tab_radius,
        fill=tab_color,
    )
    tab_draw.rounded_rectangle(
        [header_left, header_top, header_right, header_bottom],
        radius=header_radius,
        fill=tab_color,
    )

    # Subtle outline to keep crisp on light tabs
    outline_color = (15, 23, 42, 28)  # slate-900 @ low alpha
    tab_draw.rounded_rectangle(
        [tab_left, tab_top, tab_right, tab_bottom],
        radius=tab_radius,
        outline=outline_color,
        width=max(1, int(size * 0.01)),
    )

    # 2x2 tiles inside (quick navigation)
    accent = (15, 23, 42, 230)  # slate-900

    inner_left = tab_left + size * 0.12
    inner_right = tab_right - size * 0.12
    inner_top = tab_top + size * 0.14
    inner_bottom = tab_bottom - size * 0.12

    spacing = size * 0.05
    tile_size = min(
        (inner_right - inner_left - spacing) / 2,
        (inner_bottom - inner_top - spacing) / 2,
    )
    tile_radius = tile_size * 0.25

    grid_width = tile_size * 2 + spacing
    grid_height = tile_size * 2 + spacing

    start_x = (size - grid_width) / 2
    start_y = (tab_top + tab_bottom) / 2 - grid_height / 2 + size * 0.02

    for row in range(2):
        for col in range(2):
            x0 = start_x + col * (tile_size + spacing)
            y0 = start_y + row * (tile_size + spacing)
            x1 = x0 + tile_size
            y1 = y0 + tile_size
            tab_draw.rounded_rectangle([x0, y0, x1, y1], radius=tile_radius, fill=accent)

    img.alpha_composite(tab_layer)

    return img


def main() -> None:
    base = create_base_icon(512)

    # PNGs
    out_16 = base.resize((16, 16), Image.Resampling.LANCZOS)
    out_32 = base.resize((32, 32), Image.Resampling.LANCZOS)
    out_180 = base.resize((180, 180), Image.Resampling.LANCZOS)

    out_16.save(ROOT_DIR / "favicon-16x16.png", optimize=True)
    out_32.save(ROOT_DIR / "favicon-32x32.png", optimize=True)
    out_180.save(ROOT_DIR / "apple-touch-icon.png", optimize=True)

    # ICO (multi-size)
    ico_base = base.resize((256, 256), Image.Resampling.LANCZOS)
    ico_base.save(
        ROOT_DIR / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    print("Generated:")
    for name in ["favicon.ico", "favicon-16x16.png", "favicon-32x32.png", "apple-touch-icon.png"]:
        print(f"- {name}")


if __name__ == "__main__":
    main()
