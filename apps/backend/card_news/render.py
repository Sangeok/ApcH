"""Real Pillow renderer and deterministic ordered JPEG/ZIP packaging."""
import hashlib
import importlib.metadata
from functools import lru_cache
import json
import os
from pathlib import Path
import struct
import zipfile

from PIL import Image, ImageDraw, ImageFont, ImageOps

from card_news.layout import LayoutError, wrap_text

ASSETS = Path(os.environ.get("CARD_NEWS_ASSET_PATH", Path(__file__).resolve().parent / "assets"))
WIDTH, HEIGHT = 1080, 1350


def verify_dependencies(strict_versions=True):
    manifest = json.loads((ASSETS / "dependency-manifest.json").read_text(encoding="utf-8"))
    for name, expected in manifest["fonts"].items():
        if hashlib.sha256((ASSETS / name).read_bytes()).hexdigest() != expected:
            raise RuntimeError(f"font checksum mismatch: {name}")
    if hashlib.sha256((ASSETS / "OFL.txt").read_bytes()).hexdigest() != manifest["licenseSha256"]:
        raise RuntimeError("font license checksum mismatch")
    if strict_versions:
        for name, expected in manifest["packages"].items():
            if importlib.metadata.version(name) != expected:
                raise RuntimeError(f"package version mismatch: {name}")
    return manifest


@lru_cache(maxsize=4)
def font_coverage(path):
    """Read the bundled TrueType Unicode cmap; reject unsupported glyphs explicitly."""
    data = Path(path).read_bytes()
    count = struct.unpack_from(">H", data, 4)[0]
    cmap = None
    for index in range(count):
        tag, _, offset, _ = struct.unpack_from(">4sIII", data, 12 + index * 16)
        if tag == b"cmap":
            cmap = offset
            break
    if cmap is None:
        raise RuntimeError("font has no cmap")
    result = set()
    tables = struct.unpack_from(">H", data, cmap + 2)[0]
    for index in range(tables):
        platform, encoding, offset = struct.unpack_from(">HHI", data, cmap + 4 + index * 8)
        if platform != 0 and not (platform == 3 and encoding in (1, 10)):
            continue
        start = cmap + offset
        form = struct.unpack_from(">H", data, start)[0]
        if form == 12:
            groups = struct.unpack_from(">I", data, start + 12)[0]
            for group in range(groups):
                first, last, glyph = struct.unpack_from(">III", data, start + 16 + group * 12)
                result.update(range(first + (1 if glyph == 0 else 0), last + 1))
        elif form == 4:
            segments = struct.unpack_from(">H", data, start + 6)[0] // 2
            ends = start + 14
            starts = ends + segments * 2 + 2
            deltas = starts + segments * 2
            offsets = deltas + segments * 2
            for segment in range(segments):
                first = struct.unpack_from(">H", data, starts + segment * 2)[0]
                last = struct.unpack_from(">H", data, ends + segment * 2)[0]
                delta = struct.unpack_from(">h", data, deltas + segment * 2)[0]
                relative = struct.unpack_from(">H", data, offsets + segment * 2)[0]
                for codepoint in range(first, min(last + 1, 0xFFFF)):
                    if relative:
                        location = offsets + segment * 2 + relative + 2 * (codepoint - first)
                        glyph = struct.unpack_from(">H", data, location)[0]
                        glyph = (glyph + delta) & 0xFFFF if glyph else 0
                    else:
                        glyph = (codepoint + delta) & 0xFFFF
                    if glyph:
                        result.add(codepoint)
    return result


def _text(draw, text, font, xy, width, height, color, field, coverage, highlight=None, accent=None):
    for character in text:
        if character != "\n" and ord(character) not in coverage:
            raise LayoutError(field, "unsupported_glyph")
    ascent, descent = font.getmetrics()
    line_height = ascent + descent + 12
    def measure(line):
        bbox = draw.textbbox((0, 0), line, font=font)
        return max(draw.textlength(line, font=font), bbox[2] - bbox[0])
    layout = wrap_text(text, width, height, measure, line_height, field)
    x, y = xy
    highlight_start = text.find(highlight) if highlight else -1
    if highlight and highlight_start < 0:
        raise LayoutError(field.replace(".body", ".highlight"), "highlight_not_in_body")
    source_cursor = 0
    for index, line in enumerate(layout.lines):
        bounds = draw.textbbox((0, 0), line, font=font)
        # Top-align each glyph bounding box, rather than using a font-dependent baseline.
        draw.text((x - bounds[0], y + index * line_height - bounds[1]), line, font=font, fill=color)
        location = text.find(line, source_cursor) if line else source_cursor
        source_cursor = location + len(line)
        if highlight_start >= 0 and line:
            first = max(location, highlight_start)
            last = min(location + len(line), highlight_start + len(highlight))
            if first < last:
                left = x + measure(line[:first - location])
                right = x + measure(line[:last - location])
                bottom = y + index * line_height + bounds[3] - bounds[1] + 6
                draw.rectangle((left, bottom, right, bottom + 4), fill=accent)
    return layout


def render_cards(draft, candidate_paths, output_dir):
    verify_dependencies(strict_versions=False)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    title_font = ImageFont.truetype(str(ASSETS / "NotoSansKR-Bold.ttf"), size=80)
    body_font = ImageFont.truetype(str(ASSETS / "NotoSansKR-Regular.ttf"), size=56)
    label_font = ImageFont.truetype(str(ASSETS / "NotoSansKR-Bold.ttf"), size=32)
    title_coverage = font_coverage(ASSETS / "NotoSansKR-Bold.ttf")
    body_coverage = font_coverage(ASSETS / "NotoSansKR-Regular.ttf")
    background, foreground, muted = (("#FAF9F6", "#161616", "#686868") if draft["theme"] == "light"
                                     else ("#161A22", "#F7F8FC", "#B7BFCC"))
    paths = []
    for index, card in enumerate(draft["cards"]):
        image = Image.new("RGB", (WIDTH, HEIGHT), background)
        draw = ImageDraw.Draw(image)
        draw.rectangle((80, 70, 180, 80), fill=draft["accentColor"])
        draw.text((80, 1270), f"{index + 1:02d} / {len(draft['cards']):02d}", font=label_font, fill=muted)
        field = f"cards[{index}]"
        if card["role"] == "cover":
            _text(draw, card["title"], title_font, (80, 120), 920, 282, foreground,
                  field + ".title", title_coverage)
            selected = candidate_paths[draft["coverCandidateId"]]
            with Image.open(selected) as candidate:
                candidate.load()
                contained = ImageOps.contain(candidate.convert("RGB"), (920, 570))
                image.paste(contained, ((WIDTH - contained.width) // 2, 435 + (570 - contained.height) // 2))
            _text(draw, card["body"], body_font, (80, 1035), 920, 220, foreground,
                  field + ".body", body_coverage, card["highlight"], draft["accentColor"])
        else:
            _text(draw, card["title"], title_font, (80, 155), 920, 350, foreground,
                  field + ".title", title_coverage)
            _text(draw, card["body"], body_font, (80, 520), 920, 605, foreground,
                  field + ".body", body_coverage, card["highlight"], draft["accentColor"])
        path = output_dir / f"{index + 1:02d}-{card['role']}.jpg"
        image.save(path, format="JPEG", quality=94, subsampling=0, optimize=True)
        paths.append(path)
    zip_path = output_dir / "card-news.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in paths:
            entry = zipfile.ZipInfo(path.name, date_time=(2020, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, path.read_bytes())
    verify_output(paths, zip_path)
    return paths, zip_path


def verify_output(paths, zip_path):
    for path in paths:
        with Image.open(path) as image:
            image.load()
            if image.format != "JPEG" or image.mode != "RGB" or image.size != (WIDTH, HEIGHT):
                raise RuntimeError("invalid output JPEG")
    with zipfile.ZipFile(zip_path) as archive:
        if archive.namelist() != [path.name for path in paths] or archive.testzip() is not None:
            raise RuntimeError("ZIP entry order or integrity mismatch")
        for path in paths:
            if hashlib.sha256(archive.read(path.name)).digest() != hashlib.sha256(path.read_bytes()).digest():
                raise RuntimeError("ZIP image checksum mismatch")


def asset_record(path, key, identifier=None):
    path = Path(path)
    record = {"key": key, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
              "contentType": "application/zip" if path.suffix == ".zip" else "image/jpeg",
              "sizeBytes": path.stat().st_size}
    if identifier is not None:
        with Image.open(path) as image:
            image.load()
            record.update({"id": identifier, "width": image.width, "height": image.height})
    return record
