"""Parse ONLY a JSON literal assigned to $plugins; never eval JavaScript."""
from pathlib import Path
import json
import re
from .io import reject_links

def parse_plugins(path: Path):
    reject_links(path)
    text = path.read_text(encoding="utf-8-sig")
    # Standard plugins.js is comments + var $plugins = a strict JSON array.
    match = re.search(r'\b(?:var|let|const)\s+\$plugins\s*=\s*', text)
    if not match:
        raise ValueError("표준 $plugins JSON 배열 선언을 찾을 수 없습니다. 원본은 보존됩니다.")
    value, _ = json.JSONDecoder().raw_decode(text, match.end())
    if not isinstance(value, list) or not all(isinstance(x, dict) for x in value):
        raise ValueError("플러그인 설정은 객체 배열이어야 합니다.")
    return value
