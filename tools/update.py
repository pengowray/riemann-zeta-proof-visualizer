#!/usr/bin/env python3
"""Rebuild the site's data for one version of the proof, or for both.

    python3 tools/update.py cleanup     # fetch the newest community cleanup, scan it, rebuild site/data/cleanup
    python3 tools/update.py original    # rescan the original release, rebuild site/data
    python3 tools/update.py all

Where the two checkouts are on this machine is read from tools/local.json (not committed):

    {"original_src": "/path/to/original/src", "cleanup_clone": "/path/to/clone/of/riemann-hypothesis"}

The cleanup clone is a checkout of https://github.com/leanprover-community/riemann-hypothesis.
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = "leanprover-community/riemann-hypothesis"
ORIGINAL_SHA = "40e56bab026552e089d7afcfeff08d2defb9c005"  # tip of the repository's "original" branch


def run(*args, **kw):
    print("+", " ".join(args))
    return subprocess.run(args, check=True, **kw)


def git(clone, *args):
    return subprocess.run(["git", "-C", clone, *args], check=True, capture_output=True, text=True).stdout.strip()


def build(version, src, source, extra=()):
    cache = os.path.join(ROOT, "data", "cache", *([version] if version != "original" else []))
    out = os.path.join(ROOT, "site", "data", *([version] if version != "original" else []))
    os.makedirs(cache, exist_ok=True)
    source_path = os.path.join(cache, "source.json")
    json.dump(source, open(source_path, "w"))
    run(sys.executable, "-I", os.path.join(ROOT, "tools", "scan.py"), src, cache)
    # size of the whole source as one xz archive, for the page count of the compressed form
    files = subprocess.run(["find", ".", "-name", "*.lean"], cwd=src, capture_output=True, text=True, check=True).stdout
    tar = subprocess.Popen(["tar", "-cf", "-", "--sort=name", "--mtime=2026-11-20", "--owner=0", "--group=0", "-T", "-"],
                           cwd=src, stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    xz = subprocess.Popen(["xz", "-9", "-T0", "-c"], stdin=tar.stdout, stdout=subprocess.PIPE)
    count = subprocess.Popen(["wc", "-c"], stdin=xz.stdout, stdout=subprocess.PIPE)
    tar.stdin.write(files.encode())
    tar.stdin.close()
    json.dump({"xzBytes": int(count.communicate()[0])}, open(os.path.join(cache, "solid.json"), "w"))
    run(sys.executable, os.path.join(ROOT, "tools", "build_data.py"), cache, os.path.join(ROOT, "data", "labels"), out,
        "--source", source_path, *extra)
    return out


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "cleanup"
    local = json.load(open(os.path.join(ROOT, "tools", "local.json")))
    if which in ("original", "all"):
        build("original", local["original_src"], {
            "id": "original", "label": "Original release", "repo": REPO, "sha": ORIGINAL_SHA, "prefix": "src/",
            "date": "2026-11-20",
        })
    if which in ("cleanup", "all"):
        clone = local["cleanup_clone"]
        if "--no-fetch" not in sys.argv:  # --no-fetch rebuilds from the commit already checked out
            run("git", "-C", clone, "fetch", "--depth", "1", "origin", "main")
            run("git", "-C", clone, "reset", "--hard", "FETCH_HEAD")
        build("cleanup", os.path.join(clone, "src"), {
            "id": "cleanup", "label": "Community cleanup", "repo": REPO, "sha": git(clone, "rev-parse", "HEAD"),
            "prefix": "src/", "date": git(clone, "log", "-1", "--format=%cI")[:10],
        }, ("--train-cache", os.path.join(ROOT, "data", "cache")))
    # the page's version switch reads this list
    versions = []
    for version, folder in (("original", "data"), ("cleanup", "data/cleanup")):
        path = os.path.join(ROOT, "site", folder, "meta.json")
        if os.path.exists(path):
            meta = json.load(open(path))
            versions.append({**meta["source"], "data": folder + "/", "modules": meta["files"], "lines": meta["totals"]["lines"],
                             "printed": meta["printed"]})
    json.dump(versions, open(os.path.join(ROOT, "site", "data", "versions.json"), "w"), indent=1)
    print(versions)


if __name__ == "__main__":
    main()
