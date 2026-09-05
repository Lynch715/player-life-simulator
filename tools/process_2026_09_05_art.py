#!/Users/ruis/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3
"""Build and validate the 2026-09-05 trophy/poster art batch."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFont, ImageStat


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art-source"
ASSETS = ROOT / "assets"
REVIEW = ROOT / "output" / "art-review"

TROPHIES = [
    "trophy-league-csl",
    "trophy-league-pl",
    "trophy-league-laliga",
    "trophy-league-bundesliga",
    "trophy-league-seriea",
    "trophy-league-ligue1",
    "trophy-domestic-cup",
    "trophy-ucl",
    "trophy-uel",
    "trophy-acl",
    "trophy-golden-boot",
    "trophy-ballon",
    "trophy-world-cup",
    "trophy-asian-cup",
]
SEALS = ["seal-s", "seal-a", "seal-b", "seal-c", "seal-d"]
POSTERS = ["poster-velvet", "poster-leather", "poster-concrete"]
BADGES = [
    "badge-league-csl",
    "badge-league-pl",
    "badge-league-laliga",
    "badge-league-bundesliga",
    "badge-league-seriea",
    "badge-league-ligue1",
    "badge-ucl",
    "badge-acl",
]
TRANSPARENT = TROPHIES + SEALS + BADGES
ALL = TROPHIES + SEALS + POSTERS + BADGES


def _background_field(rgb: np.ndarray) -> np.ndarray:
    """Estimate the gentle generated magenta gradient from corner patches."""
    h, w, _ = rgb.shape
    size = max(8, min(h, w) // 40)
    corners = np.array(
        [
            np.median(rgb[:size, :size], axis=(0, 1)),
            np.median(rgb[:size, -size:], axis=(0, 1)),
            np.median(rgb[-size:, :size], axis=(0, 1)),
            np.median(rgb[-size:, -size:], axis=(0, 1)),
        ],
        dtype=np.float32,
    )
    x = np.linspace(0.0, 1.0, w, dtype=np.float32)[None, :, None]
    y = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None, None]
    top = corners[0] * (1 - x) + corners[1] * x
    bottom = corners[2] * (1 - x) + corners[3] * x
    return top * (1 - y) + bottom * y


def remove_magenta(im: Image.Image) -> Image.Image:
    """Turn the allowed chroma-magenta fallback into a clean alpha cutout."""
    if "A" in im.getbands() and im.getchannel("A").getextrema()[0] < 255:
        return im.convert("RGBA")

    rgb = np.asarray(im.convert("RGB"), dtype=np.float32)
    magenta_dominance = np.minimum(rgb[:, :, 0], rgb[:, :, 2]) - rgb[:, :, 1]

    # Generated backgrounds land near 175-225; real object pixels are normally <90.
    alpha = np.clip((165.0 - magenta_dominance) / 75.0, 0.0, 1.0)
    alpha[alpha < 0.035] = 0.0
    alpha[alpha > 0.965] = 1.0

    # Remove magenta spill from partially transparent antialiased edge pixels.
    bg = _background_field(rgb)
    safe_alpha = np.maximum(alpha[:, :, None], 0.08)
    foreground = (rgb - (1.0 - alpha[:, :, None]) * bg) / safe_alpha
    foreground = np.clip(foreground, 0, 255)
    foreground[alpha == 0] = 0
    rgba = np.dstack((foreground, alpha[:, :, None] * 255)).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def fit_cutout(im: Image.Image, canvas: int = 1024, target_span: int = 760) -> Image.Image:
    """Fit the visible object to 74.2% of the square, leaving reliable crop room."""
    alpha = im.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value >= 8 else 0).getbbox()
    if not bbox:
        raise ValueError("empty alpha cutout")
    cut = im.crop(bbox)
    scale = min(target_span / cut.width, target_span / cut.height)
    size = (max(1, round(cut.width * scale)), max(1, round(cut.height * scale)))
    cut = cut.resize(size, Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    out.alpha_composite(cut, ((canvas - cut.width) // 2, (canvas - cut.height) // 2))
    return out


def normalize_poster(im: Image.Image) -> Image.Image:
    im = im.convert("RGB").resize((1024, 1536), Image.Resampling.LANCZOS)
    mean = ImageStat.Stat(im.convert("L")).mean[0]
    if not 38.25 <= mean <= 63.75:
        im = ImageEnhance.Brightness(im).enhance(51.0 / max(mean, 1.0))
    return im


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def checker(size: tuple[int, int], step: int = 16) -> Image.Image:
    out = Image.new("RGB", size, "white")
    draw = ImageDraw.Draw(out)
    for y in range(0, size[1], step):
        for x in range(0, size[0], step):
            colour = (220, 220, 220) if (x // step + y // step) % 2 else (250, 250, 250)
            draw.rectangle((x, y, x + step - 1, y + step - 1), fill=colour)
    return out


def contact_sheet(names: list[str], path: Path, columns: int, thumb: int = 160) -> None:
    label_h = 28
    rows = (len(names) + columns - 1) // columns
    sheet = checker((columns * thumb, rows * (thumb + label_h)))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, name in enumerate(names):
        x = (index % columns) * thumb
        y = (index // columns) * (thumb + label_h)
        image = Image.open(ASSETS / f"{name}.webp").convert("RGBA")
        image.thumbnail((thumb, thumb), Image.Resampling.LANCZOS)
        sheet.paste(image, (x + (thumb - image.width) // 2, y), image)
        draw.rectangle((x, y + thumb, x + thumb, y + thumb + label_h), fill=(20, 24, 32))
        draw.text((x + 4, y + thumb + 7), name, fill="white", font=font)
    sheet.save(path, "WEBP", quality=88, method=6)


def build() -> dict:
    ASSETS.mkdir(exist_ok=True)
    REVIEW.mkdir(parents=True, exist_ok=True)

    records = []
    for name in TRANSPARENT:
        source = SOURCE / f"{name}.png"
        image = fit_cutout(remove_magenta(Image.open(source)))
        output = ASSETS / f"{name}.webp"
        image.save(output, "WEBP", quality=85, method=6, exact=True)
        alpha = image.getchannel("A")
        bbox = alpha.point(lambda value: 255 if value >= 8 else 0).getbbox()
        span = max(bbox[2] - bbox[0], bbox[3] - bbox[1]) / 1024
        records.append(
            {
                "name": name,
                "group": "A" if name.startswith("trophy-") else "B" if name.startswith("seal-") else "D",
                "source": str(source.relative_to(ROOT)),
                "asset": str(output.relative_to(ROOT)),
                "size": [1024, 1024],
                "mode": "RGBA",
                "alpha_extrema": list(alpha.getextrema()),
                "visible_span": round(span, 4),
                "sha256": sha256(output),
            }
        )

    for name in POSTERS:
        source = SOURCE / f"{name}.png"
        image = normalize_poster(Image.open(source))
        output = ASSETS / f"{name}.webp"
        image.save(output, "WEBP", quality=85, method=6)
        brightness = ImageStat.Stat(Image.open(output).convert("L")).mean[0] / 255
        records.append(
            {
                "name": name,
                "group": "C",
                "source": str(source.relative_to(ROOT)),
                "asset": str(output.relative_to(ROOT)),
                "size": [1024, 1536],
                "mode": "RGB",
                "mean_brightness": round(brightness, 4),
                "sha256": sha256(output),
            }
        )

    manifest = {
        "batch": "2026-09-05",
        "spec": "docs/出图规格-2026-09-05.md",
        "count": len(records),
        "files": records,
    }
    (REVIEW / "manifest-2026-09-05.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    contact_sheet(TROPHIES, REVIEW / "trophies-contact-sheet.webp", columns=7)
    contact_sheet(SEALS, REVIEW / "seals-contact-sheet.webp", columns=5)
    contact_sheet(BADGES, REVIEW / "badges-contact-sheet.webp", columns=4)

    hashes = [record["sha256"] for record in records]
    failures = []
    if len(records) != 30:
        failures.append(f"expected 30 records, got {len(records)}")
    if len(set(hashes)) != len(hashes):
        failures.append("duplicate WebP content detected")
    for record in records:
        path = ROOT / record["asset"]
        image = Image.open(path)
        if list(image.size) != record["size"]:
            failures.append(f"{record['name']}: wrong size {image.size}")
        if record["group"] in {"A", "B", "D"}:
            if "A" not in image.getbands() or image.getchannel("A").getextrema() != (0, 255):
                failures.append(f"{record['name']}: invalid alpha")
            if not 0.60 <= record["visible_span"] <= 0.80:
                failures.append(f"{record['name']}: visible span {record['visible_span']}")
        elif not 0.15 <= record["mean_brightness"] <= 0.25:
            failures.append(f"{record['name']}: mean brightness {record['mean_brightness']}")

    report = [
        "# 2026-09-05 美术批次验证报告",
        "",
        f"- 文件：{len(records)}/30",
        "- A/B/D：1024×1024、透明 WebP、主体跨度 60%–80%",
        "- C：1024×1536、不透明 WebP、平均明度 15%–25%",
        "- 重复内容：未发现" if len(set(hashes)) == len(hashes) else "- 重复内容：发现重复",
        f"- 结果：{'PASS' if not failures else 'FAIL'}",
    ]
    if failures:
        report += ["", "## 失败项", ""] + [f"- {item}" for item in failures]
    (REVIEW / "VALIDATION-2026-09-05.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    if failures:
        raise SystemExit("FAIL:\n" + "\n".join(failures))
    return manifest


if __name__ == "__main__":
    result = build()
    print(f"PASS: {result['count']} assets built and validated")
