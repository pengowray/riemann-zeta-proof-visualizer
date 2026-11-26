#!/usr/bin/env python3
"""Rebuild the site's data for one version of the proof, or for all of them.

    python3 tools/update.py grh         # the readable edition of lsernau/grh-lean, site/data/grh
    python3 tools/update.py main        # fetch the community's main branch, scan it, rebuild site/data/main
    python3 tools/update.py cleanup     # the community's cleanup of the original (alpoge branch), site/data/cleanup
    python3 tools/update.py compact     # the compact edition of lsernau/grh-lean, site/data/compact
    python3 tools/update.py original    # rescan the original release, rebuild site/data
    python3 tools/update.py all

Add --no-fetch to rebuild from the commit already checked out, and --no-compiled-check to skip reading
which definitions are always True or False from a clone's compiled files (see from_compiled).

Where the checkouts are on this machine is read from tools/local.json (not committed):

    {"original_src": "/path/to/original/src",
     "cleanup_clone": "/path/to/clone of riemann-hypothesis, alpoge branch",
     "main_clone": "/path/to/clone of riemann-hypothesis, main branch",
     "grh_clone": "/path/to/clone of grh-lean",
     "original_compiled_clone": "/path/to/clone of homeowmorphism/riemann-hypothesis-original (optional)"}

The clones are of https://github.com/leanprover-community/riemann-hypothesis and https://github.com/lsernau/grh-lean.
"""
import json
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = "leanprover-community/riemann-hypothesis"
ORIGINAL_SHA = "40e56bab026552e089d7afcfeff08d2defb9c005"  # tip of the repository's "original" branch

# In the order the page lists them. "clone" names the key in tools/local.json; "src" is the Lean source
# folder inside that clone, which is also the path prefix of every module on GitHub.
# Per-version settings that the page reads from data/versions.json (and meta.json's "source"):
#   family, short   the version's place in the sidebar list: a heading, then a short name under it
#   statements      the file that states the theorems; main: the file that proves them (shown side by side,
#                   and where the import graph and the longest import chain end)
#   features        optional sections: "steps" (jae-63's blueprint, which names the original's paths),
#                   "checks" (independent checks of the original), "changes" (comparison with the original)
#   hidden          left out of the version lists, but still shown at ?v=<id>
#   compare         false: left out of the other versions' comparison rows (the printed-pages table)
#   mapOrder        top-level directories to place first on the map, in this order (the rest follow)
#   mathlibHub      the one module the others reach Mathlib through, when the imports do not name Mathlib modules
VERSIONS = [
    {"id": "original", "label": "Original release", "family": "Original", "short": "Release", "repo": REPO, "src": "src/",
     "statements": "Statements.lean", "main": "Main.lean", "features": ["steps", "checks"]},
    # The community cleaned up the original here until 25 November 2026, then moved main to the rewrite.
    {"id": "cleanup", "label": "Original, community cleanup", "family": "Original", "short": "Community cleanup", "repo": REPO,
     "clone": "cleanup_clone", "branch": "alpoge", "src": "src/", "statements": "Statements.lean", "main": "Main.lean",
     "features": ["steps", "changes"], "compare": False},
    # main is a copy of grh-lean's readable edition (grh/) at commit 72fead1, cleaned up by the community.
    {"id": "main", "label": "Shorter rewrite, community cleanup", "family": "Shorter rewrite", "short": "Community cleanup", "repo": REPO,
     "clone": "main_clone", "branch": "main", "src": "src/", "statements": "Statements.lean", "main": "Main.lean",
     "mathlibHub": "Lib/Speed.lean", "mapOrder": ["New", "Lib"], "hidden": True},
    {"id": "grh", "label": "Shorter rewrite, readable edition", "family": "Shorter rewrite", "short": "Readable edition",
     "repo": "lsernau/grh-lean", "clone": "grh_clone", "branch": "main", "src": "grh/src/",
     "statements": "Statements.lean", "main": "Main.lean", "mathlibHub": "Lib/Speed.lean", "mapOrder": ["New", "Lib"]},
    {"id": "compact", "label": "Shorter rewrite, compact edition", "family": "Shorter rewrite", "short": "Compact edition",
     "repo": "lsernau/grh-lean", "clone": "grh_clone", "branch": "main", "src": "grh-compact/src/",
     "statements": "Statements.lean", "main": "Main.lean", "mathlibHub": "Lib/General/LinearAlgebra/Base.lean",
     "mapOrder": ["New", "Lib"]},
    # An unfinished new formalization written with GPT-6.2 Sol; holes.md lists the open obligations.
    {"id": "jamesyc", "label": "New formalization by jamesyc, unfinished", "family": "New formalization", "short": "jamesyc, unfinished",
     "repo": "jamesyc/riemann-hypothesis", "clone": "jamesyc_clone", "branch": "main", "src": "formalization/",
     "statements": "Challenge.lean", "main": "Solution.lean", "hidden": True},
]


# the settings copied into the page's data
PAGE_KEYS = ("id", "label", "family", "short", "repo", "statements", "main", "features", "mathlibHub", "hidden", "mapOrder", "compare")


def run(*args, **kw):
    print("+", " ".join(args))
    return subprocess.run(args, check=True, **kw)


def git(clone, *args):
    return subprocess.run(["git", "-C", clone, *args], check=True, capture_output=True, text=True).stdout.strip()


def capped(*cmd):
    """A heavy command at the lowest CPU and disk priority, with memory capped where systemd allows,
    so the machine stays usable (reading every compiled file at once once froze the desktop)."""
    low = ["nice", "-n", "19", "ionice", "-c3", *cmd]
    if shutil.which("systemd-run"):
        return ["systemd-run", "--user", "--scope", "-q", "-p", "MemoryMax=10G", *low]
    return low


def from_compiled(clone, cache, sha):
    """When `lake exe cache get` (or a build) has left compiled files in the clone that match its
    source, record their size for the printed-pages table, and read from them which definitions are
    always True or always False (tools/constprops_run.py) unless that was already done for this commit.
    `sha` is the commit shown on the page, which the clone's source must match."""
    lib = os.path.join(clone, ".lake", "build", "lib", "lean")
    if not os.path.isdir(lib):
        return
    if subprocess.run(["lake", "build", "--no-build"], cwd=clone, capture_output=True).returncode != 0:
        print("compiled files do not match", sha[:7], "- run `lake exe cache get` in", clone, "to use them")
        return
    sizes = [os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(lib) for f in fs if f.endswith(".olean")]
    json.dump({"bytes": sum(sizes), "modules": len(sizes), "sha": sha}, open(os.path.join(cache, "compiled.json"), "w"))
    print("compiled files:", len(sizes), "modules,", sum(sizes), "bytes")
    done = os.path.join(cache, "constprops", "constprops.json")
    if "--no-compiled-check" in sys.argv or (os.path.exists(done) and json.load(open(done)).get("sha") == sha):
        return
    run(*capped(sys.executable, os.path.join(ROOT, "tools", "constprops_run.py"), clone, os.path.join(cache, "constprops"), "--sha", sha))


def folder(version):
    """The version's folder under data/cache and site/data: the original release is at the top."""
    return [] if version == "original" else [version]


def build(version, src, source, extra=()):
    cache = os.path.join(ROOT, "data", "cache", *folder(version))
    out = os.path.join(ROOT, "site", "data", *folder(version))
    os.makedirs(cache, exist_ok=True)
    source_path = os.path.join(cache, "source.json")
    json.dump(source, open(source_path, "w"))
    run(sys.executable, "-I", os.path.join(ROOT, "tools", "scan.py"), src, cache)
    # definitions that are always True or False, estimated from the text (build_data prefers the
    # exact count from compiled files when tools/constprops_run.py has been run for this commit)
    run(sys.executable, "-I", os.path.join(ROOT, "tools", "constprops_text.py"), src, os.path.join(cache, "constprops-text.json"),
        stdout=subprocess.DEVNULL)
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
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    which = args[0] if args else "grh"
    if which != "all" and which not in [v["id"] for v in VERSIONS]:
        sys.exit(f"unknown version {which!r}: use one of {', '.join(v['id'] for v in VERSIONS)} or all")
    local = json.load(open(os.path.join(ROOT, "tools", "local.json")))
    for v in VERSIONS:
        if which not in (v["id"], "all"):
            continue
        source = {**{k: v[k] for k in PAGE_KEYS if k in v}, "prefix": v["src"]}
        if v["id"] == "original":
            # compiled files of the original come from a separate clone of the same source, if configured
            if local.get("original_compiled_clone"):
                os.makedirs(os.path.join(ROOT, "data", "cache"), exist_ok=True)
                from_compiled(local["original_compiled_clone"], os.path.join(ROOT, "data", "cache"), ORIGINAL_SHA)
            build("original", local["original_src"], {**source, "sha": ORIGINAL_SHA, "date": "2026-11-20"})
            continue
        clone = local[v["clone"]]
        if "--no-fetch" not in sys.argv:
            run("git", "-C", clone, "fetch", "--depth", "1", "origin", v["branch"])
            run("git", "-C", clone, "reset", "--hard", "FETCH_HEAD")
        # labels written for this version's directories, when its paths differ from the original's
        labels = os.path.join(ROOT, "data", "labels-" + v["id"])
        extra = ("--train-cache", os.path.join(ROOT, "data", "cache"))
        if os.path.isdir(labels):
            extra += ("--labels", labels)
        sha = git(clone, "rev-parse", "HEAD")
        os.makedirs(os.path.join(ROOT, "data", "cache", *folder(v["id"])), exist_ok=True)
        from_compiled(clone, os.path.join(ROOT, "data", "cache", *folder(v["id"])), sha)
        build(v["id"], os.path.join(clone, v["src"]), {
            **source, "sha": sha, "date": git(clone, "log", "-1", "--format=%cI")[:10],
        }, extra)
    # the page's version switch reads this list
    versions = []
    for v in VERSIONS:
        data = "/".join(["data", *folder(v["id"])]) + "/"
        path = os.path.join(ROOT, "site", data, "meta.json")
        if os.path.exists(path):
            meta = json.load(open(path))
            versions.append({**meta["source"], "data": data, "modules": meta["files"], "lines": meta["totals"]["lines"],
                             "printed": meta["printed"]})
    json.dump(versions, open(os.path.join(ROOT, "site", "data", "versions.json"), "w"), indent=1)
    print([(v["id"], v["modules"]) for v in versions])


if __name__ == "__main__":
    main()
