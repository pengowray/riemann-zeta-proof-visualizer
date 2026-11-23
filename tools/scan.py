#!/usr/bin/env python3
"""Scan every .lean file under a Lean `src` directory and write one JSON row per file.

Usage: python3 -I tools/scan.py <lean-src-dir> <out-dir>

Writes <out-dir>/files.jsonl (one row per file) and <out-dir>/groups.json
(identifier and tactic counts per directory group, used to label areas of mathematics).
Reads files as data only. Nothing in the tree is executed.
"""
import hashlib
import json
import os
import re
import sys
import zlib
from collections import Counter, defaultdict
from multiprocessing import Pool

GROUP_DEPTH = 3  # directory components that identify a group, e.g. Development/WeilBound/Proofs

DECL_RE = re.compile(
    r"^[ \t]*(?:@\[[^\]\n]*\][ \t\n]*)*"
    r"(?:(?:private|protected|noncomputable|nonrec|unsafe|partial|scoped|local)[ \t]+)*"
    r"(theorem|lemma|def|instance|abbrev|structure|class|inductive|example|opaque|axiom)\b"
    r"[ \t]*([^\s:({\[⦃]*)",
    re.M,
)
IMPORT_RE = re.compile(r"^import[ \t]+(\S+)", re.M)
NAMESPACE_RE = re.compile(r"^namespace[ \t]+(\S+)", re.M)
OPEN_RE = re.compile(r"^open[ \t]+(.+)$", re.M)
HEARTBEAT_RE = re.compile(r"set_option[ \t]+maxHeartbeats[ \t]+(\d+)")
IDENT_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_'!?₀-₉]*(?:\.[A-Za-z_][A-Za-z0-9_'!?₀-₉]*)*")
CAP_IDENT_RE = re.compile(r"(?<![A-Za-z0-9_.'])[A-Z][A-Za-z0-9]{3,}(?:\.[A-Za-z][A-Za-z0-9_']*)*")
NUM_RE = re.compile(r"\d+")
LONGNUM_RE = re.compile(r"\d{7,}")
BLOCK_COMMENT_RE = re.compile(r"/-.*?-/", re.S)
LINE_COMMENT_RE = re.compile(r"--[^\n]*")
SHIM_RE = re.compile(r":=\s*by\s*\n?\s*first\s*\|\s*exact\b")
NONASCII_RE = re.compile(r"[^\x00-\x7f]")
TACTICS = [
    "simp", "simpa", "rw", "exact", "apply", "refine", "have", "obtain", "rcases", "intro",
    "omega", "linarith", "nlinarith", "norm_num", "ring", "ring_nf", "field_simp", "positivity",
    "gcongr", "calc", "induction", "cases", "ext", "funext", "congr", "aesop", "decide",
    "native_decide", "norm_cast", "push_cast", "unfold", "show", "constructor", "use",
    "by_contra", "by_cases", "classical", "infer_instance", "rfl", "trivial", "tauto",
    "fun_prop", "measurability", "continuity", "grind", "exact_mod_cast", "convert", "sorry",
]
TACTIC_RE = re.compile(r"(?<![A-Za-z0-9_.'])(" + "|".join(TACTICS) + r")(?![A-Za-z0-9_.'])")


def scan_file(root, rel, prev_raw=b""):
    with open(os.path.join(root, rel), "rb") as fh:
        raw = fh.read()
    text = raw.decode("utf-8", errors="replace")
    lines = text.count("\n") + (0 if text.endswith("\n") or not text else 1)
    imports = IMPORT_RE.findall(text)
    body = IMPORT_RE.sub("", text)
    comment_bytes = sum(len(m) for m in BLOCK_COMMENT_RE.findall(body))
    nocomment = BLOCK_COMMENT_RE.sub("", body)
    comment_bytes += sum(len(m) for m in LINE_COMMENT_RE.findall(nocomment))
    nocomment = LINE_COMMENT_RE.sub("", nocomment)

    decls = Counter()
    names = []
    for m in DECL_RE.finditer(nocomment):
        decls[m.group(1)] += 1
        if m.group(2) and len(names) < 6:
            names.append(m.group(2))
    heartbeats = [int(x) for x in HEARTBEAT_RE.findall(nocomment)]
    tactics = Counter(TACTIC_RE.findall(nocomment))

    # Shape: the file with every identifier and number replaced by a placeholder.
    # Two files with the same shape differ only in the names and constants they use.
    shape = NUM_RE.sub("0", IDENT_RE.sub("x", nocomment))
    shape = re.sub(r"\s+", " ", shape).strip()
    shape_hash = hashlib.blake2b(shape.encode(), digest_size=6).hexdigest()

    stripped = nocomment.strip()
    if not stripped:
        kind = "imports"  # nothing but import lines: gathers other modules
    elif SHIM_RE.search(nocomment) and sum(decls.values()) == 1:
        kind = "restate"  # one theorem whose proof is `first | exact <existing lemma>`
    elif sum(decls.values()) == 0:
        kind = "setup"  # options, notation, attributes, no declarations
    else:
        kind = "math"

    digits = sum(len(x) for x in NUM_RE.findall(nocomment))
    row = {
        "p": rel,
        "b": len(raw),
        "l": lines,
        "z": len(zlib.compress(raw, 6)),
        "zd": compress_after(raw, prev_raw),
        "ml": max((len(s) for s in text.split("\n")), default=0),
        "dg": digits,
        "ln": len(LONGNUM_RE.findall(nocomment)),
        "na": len(NONASCII_RE.findall(nocomment)),
        "cb": comment_bytes,
        "d": dict(decls),
        "n": names,
        "hb": max(heartbeats, default=0),
        "hbn": len(heartbeats),
        "i": imports,
        "ns": NAMESPACE_RE.findall(nocomment)[:4],
        "t": dict(tactics),
        "sh": shape_hash,
        "k": kind,
    }
    opens = Counter()
    for line in OPEN_RE.findall(nocomment):
        for tok in line.split():
            if tok in ("in", "scoped", "hiding", "renaming"):
                break
            if tok[0].isalpha():
                opens[tok] += 1
    idents = Counter(CAP_IDENT_RE.findall(nocomment))
    return row, opens, idents, raw


def compress_after(raw, prev_raw):
    """Compressed size of `raw` when the compressor has already seen the previous
    file in the same directory. Much smaller than the plain compressed size means
    the file mostly repeats its neighbour."""
    if not prev_raw:
        return -1
    comp = zlib.compressobj(6, zlib.DEFLATED, 15, zdict=prev_raw[-32768:])
    return len(comp.compress(raw) + comp.flush())


def scan_group(args):
    root, group, rels = args
    rows = []
    opens, idents, namespaces = Counter(), Counter(), Counter()
    prev_dir, prev_raw = None, b""
    for rel in rels:
        if os.path.dirname(rel) != prev_dir:
            prev_dir, prev_raw = os.path.dirname(rel), b""
        row, o, i, prev_raw = scan_file(root, rel, prev_raw)
        rows.append(row)
        opens.update(o)
        idents.update(i)
        namespaces.update(row["ns"])
    summary = {
        "opens": opens.most_common(40),
        "idents": idents.most_common(150),
        "namespaces": namespaces.most_common(25),
    }
    return group, rows, summary


def main():
    root, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    groups = defaultdict(list)
    for dirpath, _dirs, files in os.walk(root):
        for name in files:
            if name.endswith(".lean"):
                rel = os.path.relpath(os.path.join(dirpath, name), root)
                parts = rel.split(os.sep)
                groups["/".join(parts[:-1][:GROUP_DEPTH])].append(rel)
    tasks = []
    for group, rels in groups.items():
        rels.sort()
        for start in range(0, len(rels), 2000):
            tasks.append((root, group, rels[start:start + 2000]))
    summaries = defaultdict(lambda: {"opens": Counter(), "idents": Counter(), "namespaces": Counter()})
    count = 0
    with Pool() as pool, open(os.path.join(out, "files.jsonl"), "w") as fh:
        for group, rows, summary in pool.imap_unordered(scan_group, tasks):
            for row in rows:
                fh.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
            count += len(rows)
            for key in ("opens", "idents", "namespaces"):
                summaries[group][key].update(dict(summary[key]))
    merged = {
        group: {
            "opens": s["opens"].most_common(40),
            "idents": s["idents"].most_common(150),
            "namespaces": s["namespaces"].most_common(25),
        }
        for group, s in summaries.items()
    }
    with open(os.path.join(out, "groups.json"), "w") as fh:
        json.dump(merged, fh, ensure_ascii=False)
    print(f"scanned {count} files in {len(groups)} groups")


if __name__ == "__main__":
    main()
