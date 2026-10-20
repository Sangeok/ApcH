"""stdlib-only text layout with a caller-provided real font measure function."""
from dataclasses import dataclass
import re


class LayoutError(ValueError):
    def __init__(self, field, code="text_overflow"):
        self.field = field
        self.code = code
        super().__init__(f"{code}: {field}")


@dataclass(frozen=True)
class TextLayout:
    lines: tuple
    line_height: int
    width: int
    height: int


def wrap_text(text, width, height, measure, line_height, field):
    if width <= 0 or height <= 0 or line_height <= 0:
        raise ValueError("Positive layout dimensions are required")
    lines = []
    for paragraph in text.split("\n"):
        if not paragraph:
            lines.append("")
            continue
        current = ""
        # Break Latin on words and CJK on characters; never silently truncate.
        tokens = re.findall(r"[A-Za-z0-9_'-]+|[^A-Za-z0-9_'-]", paragraph)
        for token in tokens:
            proposed = current + token
            if measure(proposed) <= width:
                current = proposed
                continue
            if current.strip():
                lines.append(current.rstrip())
                current = ""
            for character in token.lstrip():
                if measure(character) > width:
                    raise LayoutError(field, "glyph_too_wide")
                if measure(current + character) > width:
                    lines.append(current.rstrip())
                    current = character
                else:
                    current += character
        if current.strip():
            lines.append(current.rstrip())
    total = len(lines) * line_height
    if total > height:
        raise LayoutError(field)
    return TextLayout(tuple(lines), line_height, width, total)


def candidate_times(start, end, duration):
    import math
    if not all(isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
               for value in (start, end, duration)):
        raise ValueError("Finite source times required")
    if not 0 <= start < end <= duration:
        raise ValueError("Clip interval is outside the source video")
    return tuple((f"cover-{percent}", start + (end - start) * percent / 100)
                 for percent in (25, 50, 75))
