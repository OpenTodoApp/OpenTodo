#!/usr/bin/env python3
"""Merge the catalog conflicts from `git merge upstream/main`, keeping both sides.

Each locale catalog is one `"key": "value",` per line, sorted by plain byte order of
the key (scripts/i18n/extract.mjs). Both sides added keys in the same alphabetical
gap, so the resolution is the union of the two sides, sorted. A key that only one
side has stays; nothing is dropped.

  python3 scripts/dev/resolve-catalog-conflicts.py web/src/locales/de.json ...
"""
import json
import re
import sys

KEY = re.compile(r'^  ("(?:[^"\\]|\\.)*"):')


def key_of(line):
    m = KEY.match(line)
    return json.loads(m.group(1)) if m else None


def resolve(path):
    lines = open(path, encoding="utf-8").read().split("\n")
    out, i, blocks = [], 0, 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("<<<<<<<"):
            ours, theirs = [], []
            i += 1
            while not lines[i].startswith("======="):
                ours.append(lines[i])
                i += 1
            i += 1
            while not lines[i].startswith(">>>>>>>"):
                theirs.append(lines[i])
                i += 1
            i += 1
            merged = {}
            for line in ours + theirs:
                k = key_of(line)
                if k is None:
                    raise SystemExit(f"{path}: cannot read a key from {line!r}")
                if k in merged and merged[k] != line:
                    raise SystemExit(f"{path}: both sides set {k!r} differently")
                merged[k] = line
            out.extend(merged[k] for k in sorted(merged, key=lambda s: s.encode()))
            blocks += 1
            continue
        out.append(line)
        i += 1
    open(path, "w", encoding="utf-8").write("\n".join(out))
    # Every entry outside the blocks must already be in order; check the whole file.
    keys = [key_of(line) for line in out if key_of(line) is not None]
    bad = [(a, b) for a, b in zip(keys, keys[1:]) if a.encode() > b.encode()]
    print(f"{path}: {blocks} block(s), {len(keys)} keys, " + ("sorted" if not bad else f"OUT OF ORDER {bad[:3]}"))


for p in sys.argv[1:]:
    resolve(p)
