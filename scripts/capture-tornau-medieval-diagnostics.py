#!/usr/bin/env python3
"""Capture same-dimension PNG diagnostics for manual/visual GCP validation.

These files are CI artifacts only. History Core source provenance remains the
hash-pinned original Wikimedia Commons GIFs; diagnostic proxy bytes are never
used as production evidence.
"""

from __future__ import annotations

import urllib.parse
import urllib.request
from pathlib import Path

SHEETS = [
    ("862", "upload.wikimedia.org/wikipedia/commons/8/8d/Historical_map_of_Rus%27%2C_862.gif"),
    ("1054-1240", "upload.wikimedia.org/wikipedia/commons/3/32/Historical_map_of_the_Rus%2C_1054-1240.gif"),
    ("1240-1533", "upload.wikimedia.org/wikipedia/commons/1/18/Historical_map_of_Rus%27%2C_1240-1533.gif"),
]


def main() -> None:
    out = Path("tornau-medieval-diagnostics")
    out.mkdir(exist_ok=True)
    for sheet_id, source in SHEETS:
        encoded = urllib.parse.quote(source, safe="/%")
        url = f"https://images.weserv.nl/?url={encoded}&w=1800&h=2207&fit=fill&output=png"
        request = urllib.request.Request(
            url,
            headers={"User-Agent": "RulersOfRussiaHistoryCore/1.0 (research diagnostic)"},
        )
        with urllib.request.urlopen(request, timeout=90) as response:
            data = response.read()
        target = out / f"tornau-{sheet_id}.png"
        target.write_bytes(data)
        print(f"Captured research diagnostic {target}: {len(data)} bytes")


if __name__ == "__main__":
    main()
