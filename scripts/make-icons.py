"""Generate the PWA icons from the shipped tanuki sprite sheet.

iOS needs a real PNG for the home-screen icon; an SVG-only manifest leaves the
installed app with a screenshot thumbnail. Run after changing the tanuki art:

    .venv/bin/python scripts/make-icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / "assets" / "tanuki-sprites-v2.png"
PUBLIC = ROOT / "public"

# The wave pose sits in column 0, row 0 of the 3x2 sheet.
COLUMNS, ROWS = 3, 2
BACKGROUND_TOP = (191, 231, 226, 255)
BACKGROUND_BOTTOM = (142, 201, 127, 255)


def pose(sheet: Image.Image, column: int, row: int) -> Image.Image:
    width = sheet.width // COLUMNS
    height = sheet.height // ROWS
    cell = sheet.crop((column * width, row * height, (column + 1) * width, (row + 1) * height))
    return cell.crop(cell.getbbox())


def background(size: int, radius_ratio: float) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gradient = Image.new("RGBA", (1, size))
    for y in range(size):
        blend = y / max(size - 1, 1)
        gradient.putpixel(
            (0, y),
            tuple(
                int(BACKGROUND_TOP[index] + (BACKGROUND_BOTTOM[index] - BACKGROUND_TOP[index]) * blend)
                for index in range(4)
            ),
        )
    gradient = gradient.resize((size, size))

    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    radius = int(size * radius_ratio)
    if radius <= 0:
        draw.rectangle((0, 0, size, size), fill=255)
    else:
        draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    canvas.paste(gradient, (0, 0), mask)
    return canvas


def build(size: int, radius_ratio: float, scale: float, destination: Path) -> None:
    icon = background(size, radius_ratio)
    tanuki = pose(Image.open(SHEET).convert("RGBA"), 0, 0)
    target_height = int(size * scale)
    target_width = max(1, int(tanuki.width * target_height / tanuki.height))
    tanuki = tanuki.resize((target_width, target_height), Image.LANCZOS)
    icon.alpha_composite(
        tanuki,
        ((size - target_width) // 2, size - target_height - int(size * 0.05)),
    )
    icon.save(destination)
    print(f"wrote {destination.relative_to(ROOT)} ({size}x{size})")


if __name__ == "__main__":
    # iOS applies its own rounding, so the touch icon stays square and opaque.
    build(180, 0.0, 0.82, PUBLIC / "apple-touch-icon.png")
    build(192, 0.22, 0.8, PUBLIC / "icon-192.png")
    build(512, 0.22, 0.8, PUBLIC / "icon-512.png")
    # Maskable icons must keep artwork inside the safe circle.
    build(512, 0.0, 0.62, PUBLIC / "icon-maskable-512.png")
