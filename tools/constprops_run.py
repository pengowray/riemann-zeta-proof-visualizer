#!/usr/bin/env python3
"""Run tools/constprops.lean over a version's compiled modules, in chunks, and summarise.

    python3 tools/constprops_run.py CLONE OUT_DIR

CLONE is a checkout after `lake exe cache get`. Each chunk runs in its own process (WORKERS at a
time), so no process holds every compiled file at once. Writes OUT_DIR/constprops.json:

    {"sha", "declarations", "reachedByTheorems",
     "defs": [{"name", "module", "value": "True"|"False", "mentionDecls", "mentionModules": [...],
               "hypDecls", "usedByTheorems", "mentionsInProof"}]}

mentionDecls counts declarations that use the definition; hypDecls those that take an argument of
its type; usedByTheorems says whether the five theorems depend on it, through project declarations;
mentionsInProof counts the declarations they depend on that use it.
"""
import glob
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

import numpy as np

CHUNK = 2000
WORKERS = 2
ROOTS = ["riemannHypothesis", "riemannZeta_eq_zero_re", "LFunction_ne_zero_of_half_lt_re",
         "LFunction_eq_zero_re", "LFunction_eq_zero_re_of_isPrimitive"]


def main():
    clone, out = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
    os.makedirs(out, exist_ok=True)
    toolchain = open(os.path.join(clone, "lean-toolchain")).read().strip()
    program = os.path.join(os.path.dirname(os.path.abspath(__file__)), "constprops.lean")
    lib = os.path.join(clone, ".lake", "build", "lib", "lean")
    project = sorted((p, os.path.relpath(p, lib)[:-6].replace(os.sep, "."))
                     for p in glob.iglob(os.path.join(lib, "**", "*.olean"), recursive=True))
    lists = []
    for k, start in enumerate(range(0, len(project), CHUNK)):
        path = os.path.join(out, f"list_{k}.txt")
        with open(path, "w") as fh:
            fh.write("".join(f"{p}\t{m}\n" for p, m in project[start:start + CHUNK]))
        lists.append(path)

    def lean(*args):
        subprocess.run(["lean", "+" + toolchain, "--run", program, *args], check=True)

    with ThreadPoolExecutor(WORKERS) as pool:
        list(pool.map(lambda k: lean("names", lists[k], os.path.join(out, f"names_{k}.txt")), range(len(lists))))
    names, modules = [], []
    for k in range(len(lists)):
        for line in open(os.path.join(out, f"names_{k}.txt"), encoding="utf-8"):
            n, m = line.rstrip("\n").split("\t")
            names.append(n)
            modules.append(m)
    with open(os.path.join(out, "names.txt"), "w", encoding="utf-8") as fh:
        fh.write("".join(n + "\n" for n in names))
    print(len(project), "modules,", len(names), "declarations", flush=True)

    with ThreadPoolExecutor(WORKERS) as pool:
        list(pool.map(lambda k: lean("edges", lists[k], os.path.join(out, "names.txt"), os.path.join(out, f"part_{k}")),
                      range(len(lists))))

    def pairs(ext):
        parts = [np.fromfile(os.path.join(out, f"part_{k}.{ext}"), dtype="<u4") for k in range(len(lists))]
        a = np.concatenate(parts) if parts else np.zeros(0, dtype="<u4")
        return a[0::2], a[1::2]

    src, dst = pairs("edges")
    hsrc, hdst = pairs("hyps")
    defs = []
    for k in range(len(lists)):
        for line in open(os.path.join(out, f"part_{k}.defs")):
            i, v = line.split()
            defs.append((int(i), v))
    n = len(names)
    # what the five theorems depend on: breadth-first search over the edges, sorted by source
    order = np.argsort(src, kind="stable")
    src_sorted, dst_sorted = src[order], dst[order]
    starts = np.searchsorted(src_sorted, np.arange(n + 1))
    index = {name: i for i, name in enumerate(names)}
    seen = np.zeros(n, dtype=bool)
    frontier = np.array([index[r] for r in ROOTS if r in index], dtype=np.int64)
    seen[frontier] = True
    while frontier.size:
        nxt = np.concatenate([dst_sorted[starts[i]:starts[i + 1]] for i in frontier]) if frontier.size else np.zeros(0)
        nxt = np.unique(nxt)
        nxt = nxt[~seen[nxt]]
        seen[nxt] = True
        frontier = nxt
    result = []
    for i, v in defs:
        users = src[dst == i]
        hyp = hsrc[hdst == i]
        result.append({
            "name": names[i], "module": modules[i], "value": v,
            "mentionDecls": int(users.size),
            "mentionModules": sorted({modules[u] for u in users.tolist()}),
            "hypDecls": int(np.unique(hyp).size),
            "usedByTheorems": bool(seen[i]),
            "mentionsInProof": int(np.count_nonzero(seen[users])),
        })
    sha = subprocess.run(["git", "-C", clone, "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    json.dump({"sha": sha, "declarations": n, "reachedByTheorems": int(seen.sum()), "defs": result},
              open(os.path.join(out, "constprops.json"), "w"), ensure_ascii=False, indent=1)
    for d in result:
        print(d["value"], d["name"], d["mentionDecls"], len(d["mentionModules"]), d["hypDecls"], d["usedByTheorems"], d["mentionsInProof"])
    print("theorems depend on", int(seen.sum()), "of", n, "declarations")


if __name__ == "__main__":
    main()
