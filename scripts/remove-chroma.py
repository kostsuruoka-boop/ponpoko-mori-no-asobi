"""Turn a flat chroma-key sprite sheet into RGBA with clean edges.

Kept in the repository so the artwork pipeline is self-contained: master sheet
in, transparent sheet out, no external tooling.

    .venv/bin/python scripts/remove-chroma.py \
        --input tmp/imagegen/abc-sprites-chroma.png \
        --out assets/abc-sprites-v1.png

The key colour is sampled from the border by default, which is safer than
hard-coding #00ff00: generators rarely produce the exact requested value.

Two thresholds shape the matte. Pixels closer to the key than
--transparent-threshold become fully transparent, pixels beyond
--opaque-threshold stay fully opaque, and the band between them fades, which is
what keeps anti-aliased outlines from turning into jagged steps.

Despill then removes the green or magenta light the backdrop cast onto the
subject, but only inside that fade band, so genuinely green leaves and orange
fur are never touched.

The defaults were tuned by rerunning the shipped animal sheet through this
script and comparing outlines against the released artwork; looser thresholds
leave a green halo one or two pixels wide.
"""

import argparse
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent


def sample_key(image: Image.Image, border: int = 6) -> tuple[int, int, int]:
    """Average the outer frame, which is background by construction."""
    pixels = image.load()
    width, height = image.size
    totals = [0, 0, 0]
    count = 0
    for y in range(height):
        inside_vertically = border <= y < height - border
        for x in range(width):
            if inside_vertically and border <= x < width - border:
                continue
            red, green, blue = pixels[x, y][:3]
            totals[0] += red
            totals[1] += green
            totals[2] += blue
            count += 1
    return tuple(value // max(count, 1) for value in totals)


def distance(colour: tuple[int, int, int], key: tuple[int, int, int]) -> float:
    return sum((colour[index] - key[index]) ** 2 for index in range(3)) ** 0.5


def despill(colour: tuple[int, int, int], key: tuple[int, int, int], amount: float):
    """Pull the dominant key channel back towards the other two."""
    if amount <= 0:
        return colour
    red, green, blue = colour
    channel = key.index(max(key))
    others = [value for index, value in enumerate((red, green, blue)) if index != channel]
    limit = sum(others) / 2
    current = (red, green, blue)[channel]
    if current <= limit:
        return colour
    corrected = list(colour)
    corrected[channel] = round(current + (limit - current) * amount)
    return tuple(corrected)


def convert(source: Path, destination: Path, arguments) -> None:
    image = Image.open(source).convert("RGBA")
    key = (
        tuple(int(part) for part in arguments.key.split(","))
        if arguments.key
        else sample_key(image)
    )
    near = float(arguments.transparent_threshold)
    far = float(arguments.opaque_threshold)
    if far <= near:
        raise SystemExit("--opaque-threshold must be larger than --transparent-threshold")

    pixels = image.load()
    width, height = image.size
    cleared = 0
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                continue
            gap = distance((red, green, blue), key)
            if gap <= near:
                pixels[x, y] = (0, 0, 0, 0)
                cleared += 1
                continue
            if gap >= far:
                continue
            blend = (gap - near) / (far - near)
            colour = despill((red, green, blue), key, arguments.despill * (1 - blend))
            pixels[x, y] = colour + (round(alpha * blend),)

    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, optimize=True)
    share = cleared / (width * height) * 100
    try:
        shown = destination.relative_to(ROOT)
    except ValueError:
        shown = destination
    print(f"key rgb{key} -> {shown} ({share:.1f}% cleared)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--key", help="explicit r,g,b instead of sampling the border")
    parser.add_argument("--transparent-threshold", type=float, default=95)
    parser.add_argument("--opaque-threshold", type=float, default=160)
    parser.add_argument("--despill", type=float, default=0.95)
    options = parser.parse_args()
    convert(Path(options.input), Path(options.out), options)
