#!/usr/bin/env python3
"""Find definitions that are always True or always False by reading the Lean text, for versions
without compiled files (tools/constprops_run.py is exact; this is an estimate).

    python3 -I tools/constprops_text.py SRC OUT.json

A definition counts when its value, after any `fun x =>` binders, is `True` or `False`
(for example `def anyGeometry : GeoP := fun _ _ _ => True`). Its full name comes from the
`namespace` blocks around it. A module counts as mentioning it when the module names it fully,
names it by a dotted suffix of its full name (`M.Sw`), or names it bare (`Sw`) while it is inside
or has opened the definition's namespace (or the definition has none). A hypothesis is an argument
whose type starts with the definition's name, such as `(Ψ : Sw)`.
"""
import json
import os
import re
import sys
from multiprocessing import Pool

DECL = re.compile(
    r"^(?:@\[[^\]]*\]\s*)*(?:(?:private|protected|noncomputable|nonrec|partial|unsafe|public)\s+)*"
    r"(def|abbrev)\s+([^\s:({\[]+)", re.M)
SCOPE = re.compile(r"^(namespace|section|end)\b[ \t]*([^\s-]*)", re.M)
OPEN = re.compile(r"^\s*open\s+(?:scoped\s+)?([^\n(]+)", re.M)
COMMENT = re.compile(r"/-.*?-/|--[^\n]*", re.S)
BODY = re.compile(r"^(?:(?:fun|λ)\s[^=]*?(?:=>|↦)\s*)?\(?\s*(True|False)\s*\)?$", re.S)
IDENT = re.compile(r"[A-Za-z_Ͱ-Ͽἀ-῿][\w'!?₀-ₜͰ-Ͽ.]*")
NEXT = re.compile(r"^\S", re.M)


def value_of(block):
    depth = 0
    for j, ch in enumerate(block):
        if ch in "([{⟨":
            depth += 1
        elif ch in ")]}⟩":
            depth -= 1
        elif ch == ":" and depth == 0 and block[j + 1:j + 2] == "=":
            return block[j + 2:]
    return None


def namespaces_at(text):
    """(position, namespace) at each namespace/section/end line, in order."""
    stack, out = [], [(0, "")]
    for m in SCOPE.finditer(text):
        kind, arg = m.group(1), m.group(2)
        if kind == "namespace":
            stack.append(("ns", arg))
        elif kind == "section":
            stack.append(("sec", arg))
        elif stack:
            stack.pop()
        out.append((m.start(), ".".join(a for k, a in stack if k == "ns")))
    return out


def find(args):
    root, rel = args
    text = COMMENT.sub("", open(os.path.join(root, rel), encoding="utf-8", errors="replace").read())
    scopes = namespaces_at(text)
    defs = []
    for m in DECL.finditer(text):
        nxt = NEXT.search(text, text.find("\n", m.end()) + 1 or len(text))
        value = value_of(text[m.start():nxt.start() if nxt else len(text)])
        c = BODY.match(" ".join(value.split())) if value else None
        if c:
            ns = [s for p, s in scopes if p <= m.start()][-1]
            name = m.group(2).lstrip("_root_.") if m.group(2).startswith("_root_.") else (ns + "." + m.group(2) if ns else m.group(2))
            defs.append({"name": name, "file": rel, "value": c.group(1), "line": text.count("\n", 0, m.start()) + 1})
    opened = {o for line in OPEN.findall(text) for o in line.split()}
    inside = {s for _, s in scopes if s}
    return defs, set(IDENT.findall(text)), opened | inside


def mentions(name, words, scopes):
    parts = name.split(".")
    short, ns = parts[-1], ".".join(parts[:-1])
    suffixes = {".".join(parts[i:]) for i in range(len(parts) - 1)}  # full name and dotted suffixes
    if words & suffixes:
        return True
    if short not in words:
        return False
    # inside the namespace or one below it, or after opening it (possibly by a shorter relative name)
    return not ns or any(s == ns or s.startswith(ns + ".") or ns.endswith("." + s) for s in scopes)


def main():
    root, out = sys.argv[1], sys.argv[2]
    files = sorted(os.path.relpath(os.path.join(d, f), root) for d, _, fs in os.walk(root) for f in fs if f.endswith(".lean"))
    workers = max(1, (os.cpu_count() or 2) // 2)
    with Pool(workers) as pool:
        scanned = pool.map(find, [(root, f) for f in files], chunksize=200)
    defs = [d for ds, _, _ in scanned for d in ds]
    hyp = {d["name"]: re.compile(r":\s*(?:[\w.]*\.)?" + re.escape(d["name"].split(".")[-1]) + r"\b") for d in defs if d["value"] == "False"}
    for d in defs:
        d["mentionModules"] = [f for (ds, words, scopes), f in zip(scanned, files)
                               if f != d["file"] and mentions(d["name"], words, scopes)]
        d["hypModules"] = 0
    for d in defs:
        if d["value"] == "False":
            pat = hyp[d["name"]]
            d["hypModules"] = sum(1 for f in d["mentionModules"]
                                  if pat.search(open(os.path.join(root, f), encoding="utf-8", errors="replace").read()))
    json.dump({"modules": len(files), "defs": defs}, open(out, "w"), ensure_ascii=False, indent=1)
    for d in sorted(defs, key=lambda d: -len(d["mentionModules"])):
        print(d["value"], d["name"], len(d["mentionModules"]), d["hypModules"], d["file"])


if __name__ == "__main__":
    main()
