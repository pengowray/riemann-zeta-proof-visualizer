#!/usr/bin/env python3
"""Run tools/usage.lean over every compiled module of the cleanup checkout.

    python3 tools/usage_run.py CLONE OUT_DIR [LIMIT]

CLONE is a checkout of leanprover-community/riemann-hypothesis after `lake exe cache get`.
The project's modules are split into chunks that run side by side, because one process
keeps every file it has read mapped in memory. Each chunk writes OUT_DIR/usage_<n>.txt.
"""
import glob
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

CHUNK = 2000
WORKERS = 4


def oleans(root):
    for path in glob.iglob(os.path.join(root, "**", "*.olean"), recursive=True):
        yield path, os.path.relpath(path, root)[:-6].replace(os.sep, ".")


def main():
    clone, out = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else None
    os.makedirs(out, exist_ok=True)
    toolchain = open(os.path.join(clone, "lean-toolchain")).read().strip()
    prefix = subprocess.run(["lean", "+" + toolchain, "--print-prefix"], capture_output=True, text=True, check=True).stdout.strip()
    library = list(oleans(os.path.join(prefix, "lib", "lean")))
    for package in sorted(glob.glob(os.path.join(clone, ".lake", "packages", "*"))):
        library += oleans(os.path.join(package, ".lake", "build", "lib", "lean"))
    project = sorted(oleans(os.path.join(clone, ".lake", "build", "lib", "lean")), key=lambda x: x[1])[:limit]
    head = "".join(f"{p}\t{m}\t0\n" for p, m in library)
    jobs = []
    for k, start in enumerate(range(0, len(project), CHUNK)):
        listing = os.path.join(out, f"list_{k}.txt")
        with open(listing, "w") as fh:
            fh.write(head + "".join(f"{p}\t{m}\t1\n" for p, m in project[start:start + CHUNK]))
        jobs.append((listing, os.path.join(out, f"usage_{k}.txt")))
    program = os.path.join(os.path.dirname(os.path.abspath(__file__)), "usage.lean")

    def run(job):
        subprocess.run(["lean", "+" + toolchain, "--run", program, *job], check=True)
        return job[1]

    with ThreadPoolExecutor(WORKERS) as pool:
        for done in pool.map(run, jobs):
            print("wrote", done, flush=True)


if __name__ == "__main__":
    main()
