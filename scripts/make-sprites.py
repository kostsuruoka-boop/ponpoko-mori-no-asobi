"""Slice the generated sprite sheets into one PNG per subject.

A single CSS sprite sheet is scaled by `background-size: 300% 300%`, and on a
device whose element size is not an exact multiple of the grid the neighbouring
cell bleeds a sliver into view — a white daikon tip floating next to a carrot.
Individual files remove that class of bug entirely and simplify the CSS to
`background-size: contain`.

Every cell in every sheet is already square and consistently framed, so slicing
without trimming preserves the relative scale between subjects.

    .venv/bin/python scripts/make-sprites.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
OUTPUT = ASSETS / "sprites"

SHEETS = [
    (
        "fruit-sprites-v1.png",
        3,
        3,
        [
            "apple", "orange", "grape",
            "peach", "cherry", "lemon",
            "strawberry", "watermelon", "banana",
        ],
    ),
    (
        "vegetable-sprites-v1.png",
        3,
        3,
        [
            "daikon", "cabbage", "pumpkin",
            "carrot", "onion", "edamame",
            "cucumber", "eggplant", "sweet-potato",
        ],
    ),
    (
        "animal-sprites-v1.png",
        3,
        4,
        [
            "dog", "cat", "panda",
            "lion", "elephant", "giraffe",
            "hippo", "monkey", "zebra",
            "camel", "pig", "bird",
        ],
    ),
    (
        "tanuki-sprites-v2.png",
        3,
        2,
        [
            "tanuki-wave", "tanuki-run", "tanuki-reach",
            "tanuki-basket", "tanuki-push", "tanuki-jump",
        ],
    ),
    # Optional: only sliced when the artwork has been added.
    (
        "abc-sprites-v1.png",
        3,
        4,
        [
            "abc-fish", "abc-igloo", "abc-juice",
            "abc-kite", "abc-nest", "abc-queen",
            "abc-rabbit", "abc-tiger", "abc-umbrella",
            "abc-violin", "abc-xylophone", "abc-yoyo",
        ],
    ),
]

# Each cell keeps its own framing so a cherry stays smaller than a watermelon.
MAX_SIDE = 420

# Alpha above this counts as "drawn"; below it is anti-aliasing or background.
ALPHA_FLOOR = 40

# A blob smaller than this share of the biggest blob is a neighbour bleeding
# across the cell border (the daikon tip reaching into the carrot's cell), not
# a real part of the subject. Cherries and banana bunches stay well above it.
MIN_BLOB_SHARE = 0.06


def remove_stray_blobs(cell: Image.Image) -> Image.Image:
    """Drop disconnected fragments that leaked in from a neighbouring cell."""
    width, height = cell.size
    alpha = cell.getchannel("A").load()
    labels = [0] * (width * height)
    sizes = [0]
    current = 0

    for start_y in range(height):
        for start_x in range(width):
            if alpha[start_x, start_y] < ALPHA_FLOOR or labels[start_y * width + start_x]:
                continue
            current += 1
            count = 0
            stack = [(start_x, start_y)]
            labels[start_y * width + start_x] = current
            while stack:
                x, y = stack.pop()
                count += 1
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if not (0 <= nx < width and 0 <= ny < height):
                        continue
                    index = ny * width + nx
                    if labels[index] or alpha[nx, ny] < ALPHA_FLOOR:
                        continue
                    labels[index] = current
                    stack.append((nx, ny))
            sizes.append(count)

    if current <= 1:
        return cell

    biggest = max(sizes)
    keep = {label for label in range(1, current + 1) if sizes[label] >= biggest * MIN_BLOB_SHARE}
    if len(keep) == current:
        return cell

    cleaned = cell.copy()
    pixels = cleaned.load()
    stray = [
        (index % width, index // width)
        for index, label in enumerate(labels)
        if label and label not in keep
    ]
    # Clear a small halo too, so the anti-aliased fringe of the fragment goes
    # with it, but never touch pixels that belong to a blob we are keeping.
    halo = 3
    for x, y in stray:
        for dy in range(-halo, halo + 1):
            for dx in range(-halo, halo + 1):
                nx, ny = x + dx, y + dy
                if not (0 <= nx < width and 0 <= ny < height):
                    continue
                label = labels[ny * width + nx]
                if label in keep:
                    continue
                pixels[nx, ny] = (0, 0, 0, 0)
    print(f"  removed {current - len(keep)} stray fragment(s), {len(stray)}px")
    return cleaned


def slice_sheet(name: str, columns: int, rows: int, ids: list[str]) -> int:
    source = ASSETS / name
    if not source.exists():
        print(f"skip {name} (not present)")
        return 0

    sheet = Image.open(source).convert("RGBA")
    if sheet.width % columns or sheet.height % rows:
        raise SystemExit(f"{name}: {sheet.size} does not divide into {columns}x{rows}")

    cell_width = sheet.width // columns
    cell_height = sheet.height // rows
    written = 0
    for index, sprite_id in enumerate(ids):
        column = index % columns
        row = index // columns
        cell = sheet.crop(
            (
                column * cell_width,
                row * cell_height,
                (column + 1) * cell_width,
                (row + 1) * cell_height,
            )
        )
        print(f"  {sprite_id}")
        cell = remove_stray_blobs(cell)
        if max(cell.size) > MAX_SIDE:
            scale = MAX_SIDE / max(cell.size)
            cell = cell.resize(
                (round(cell.width * scale), round(cell.height * scale)), Image.LANCZOS
            )
        cell.save(OUTPUT / f"{sprite_id}.png", optimize=True)
        written += 1
    print(f"{name}: wrote {written} sprites")
    return written


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for sheet_name, columns, rows, ids in SHEETS:
        total += slice_sheet(sheet_name, columns, rows, ids)
    print(f"total {total} sprites in {OUTPUT.relative_to(ROOT)}")
