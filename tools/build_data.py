#!/usr/bin/env python3
"""Turn the scan cache into the compact data files the page loads.

Usage: python3 tools/build_data.py <cache-dir> <labels-dir> <site-data-dir>

Outputs in <site-data-dir>:
  meta.json   directories, column layout, labels, import matrices, longest chain, totals
  cols.bin    one typed array per column, one value per file, in the file order of meta.json
  names.txt   file names without ".lean", one per line, same order
  terms.bin   one bitset per search term
"""
import glob
import math
import json
import os
import re
import sys
from array import array
from collections import Counter, defaultdict

FIELDS = [
    # id, name, family id
    ("analytic-nt", "Analytic number theory", "analytic"),
    ("algebraic-nt", "Algebraic number theory", "algnt"),
    ("cohomology", "Galois and étale cohomology", "algnt"),
    ("automorphic", "Automorphic forms and representations", "automorphic"),
    ("theta", "Theta series and theta correspondence", "theta"),
    ("rep-theory", "Representation theory", "automorphic"),
    ("arith-geom", "Arithmetic geometry", "geometry"),
    ("padic-hodge", "p-adic Hodge theory", "geometry"),
    ("alg-geom", "Algebraic geometry", "geometry"),
    ("algebra", "Algebra", "algebra"),
    ("lattices", "Lattices and geometry of numbers", "lattices"),
    ("harmonic", "Harmonic and functional analysis", "analysis"),
    ("analysis", "Real and complex analysis", "analysis"),
    ("measure", "Measure and integration", "analysis"),
    ("combinatorics", "Combinatorics", "discrete"),
    ("computation", "Explicit computation", "discrete"),
    ("glue", "Aggregators and build helpers", "glue"),
    ("unknown", "Not labelled", "glue"),
]
FAMILIES = [
    ("analytic", "Analytic number theory"),
    ("algnt", "Algebraic number theory and cohomology"),
    ("automorphic", "Automorphic forms and representation theory"),
    ("theta", "Theta series and theta correspondence"),
    ("geometry", "Arithmetic and algebraic geometry"),
    ("algebra", "Algebra"),
    ("lattices", "Lattices and geometry of numbers"),
    ("analysis", "Analysis"),
    ("discrete", "Combinatorics and explicit computation"),
    ("glue", "Aggregators and build helpers"),
]
KINDS = ["math", "restate", "imports", "setup"]
SPLIT_REGIONS = {"Development", "GroundTheory", "CompanionTheory"}

from scan import TERMS  # noqa: E402  (same directory)


def region_of(path):
    parts = path.split("/")
    if len(parts) == 1:
        return "(top level)"
    if parts[0] in SPLIT_REGIONS and len(parts) > 2:
        return parts[0] + "/" + parts[1]
    return parts[0]


def main():
    cache, labels_dir, out = sys.argv[1:4]
    os.makedirs(out, exist_ok=True)
    rows = [json.loads(line) for line in open(os.path.join(cache, "files.jsonl"))]

    # ---- build times from an independent rebuild (see data/external/README.md)
    build_path = os.path.join(os.path.dirname(labels_dir.rstrip("/")), "external", "build_seconds.f32")
    build_seconds = {}
    if os.path.exists(build_path):
        values = array("f")
        values.frombytes(open(build_path, "rb").read())
        for path, sec in zip(sorted(r["p"] for r in rows), values):
            if sec == sec:  # skip NaN
                build_seconds[path] = sec

    # ---- directory tree, files ordered so each directory's subtree is one contiguous range
    tree = {"name": "", "dirs": {}, "files": []}
    for r in rows:
        parts = r["p"].split("/")
        node = tree
        for part in parts[:-1]:
            node = node["dirs"].setdefault(part, {"name": part, "dirs": {}, "files": []})
        node["files"].append(r)
    dirs, order = [], []

    def walk(node, parent, path):
        idx = len(dirs)
        entry = {"n": node["name"], "p": parent, "s": len(order)}
        dirs.append(entry)
        node["files"].sort(key=lambda r: r["p"])
        order.extend(node["files"])
        entry["f"] = len(node["files"])
        for name in sorted(node["dirs"]):
            walk(node["dirs"][name], idx, (path + "/" + name) if path else name)
        entry["e"] = len(order)
        entry["path"] = path

    walk(tree, -1, "")
    rows = order
    n = len(rows)
    index = {r["p"]: i for i, r in enumerate(rows)}

    # ---- labels (written by the labelling agents, one entry per directory group)
    labels = {}
    # batch_*.json label directories three levels deep; sub_*.json label the larger
    # subdirectories of oversized ones, from a sample of their modules
    for path in sorted(glob.glob(os.path.join(labels_dir, "batch_*.json")) + glob.glob(os.path.join(labels_dir, "sub_*.json"))):
        try:
            for entry in json.load(open(path)):
                labels[entry["id"]] = entry
        except (ValueError, KeyError, TypeError) as err:
            print("skipped", path, err)
    field_ids = [f[0] for f in FIELDS]
    group_list, group_index = [], {}
    field_col = array("B")
    group_col = array("H")
    for r in rows:
        parts = r["p"].split("/")[:-1]
        g = "/".join(parts[:4])
        if len(parts) < 4 or g not in labels:
            g = "/".join(parts[:3]) or "(root)"
        if g not in group_index:
            lab = labels.get(g, {})
            field = lab.get("field") if lab.get("field") in field_ids else "unknown"
            if g == "(root)":
                field, lab = "analytic-nt", {
                    "label": "Statements and main theorems",
                    "objects": ["Riemann zeta function", "Dirichlet L-function"],
                    "gloss": "The statements of the Riemann Hypothesis and its Dirichlet generalization, and the five final theorems.",
                }
            group_index[g] = len(group_list)
            group_list.append({
                "id": g,
                "label": lab.get("label") or g.split("/")[-1],
                "field": field_ids.index(field),
                "field2": field_ids.index(lab["field2"]) if lab.get("field2") in field_ids else -1,
                "objects": lab.get("objects") or [],
                "gloss": lab.get("gloss") or "",
                "confidence": lab.get("confidence") or "",
                "sampled": lab.get("sampled") or 0,
            })
        gi = group_index[g]
        group_col.append(gi)
        field_col.append(group_list[gi]["field"])

    # Field per file, from the identifiers the file uses. A field wins when its
    # identifiers are much denser in this file than in the tree as a whole. Files
    # with fewer than two matching identifiers keep their directory's field.
    scan_fields = ["analytic-nt", "algebraic-nt", "cohomology", "automorphic", "theta", "rep-theory",
                   "arith-geom", "padic-hodge", "alg-geom", "algebra", "lattices", "harmonic",
                   "analysis", "measure", "combinatorics"]
    total_bytes = sum(r["b"] for r in rows)
    density = [sum(r["fc"][j] for r in rows) / total_bytes for j in range(len(scan_fields))]
    by_keywords = 0
    keyword_field = [-1] * n
    for i, r in enumerate(rows):
        best, best_score = -1, 0.0
        for j, count in enumerate(r["fc"]):
            if count >= 2:
                score = count / (density[j] * r["b"] + 2)
                if score > best_score:
                    best, best_score = j, score
        if best >= 0:
            field_col[i] = field_ids.index(scan_fields[best])
            keyword_field[i] = field_col[i]
            by_keywords += 1

    # ---- import graph
    module = {r["p"][:-5].replace("/", "."): i for i, r in enumerate(rows)}
    adj = [sorted({module[m] for m in r["i"] if m in module}) for r in rows]
    indeg = [0] * n
    for a in adj:
        for j in a:
            indeg[j] += 1
    height = [-1] * n
    best = [-1] * n
    for start in range(n):
        stack = [(start, 0)]
        while stack:
            node, k = stack[-1]
            if height[node] >= 0:
                stack.pop()
            elif k < len(adj[node]):
                stack[-1] = (node, k + 1)
                if height[adj[node][k]] < 0:
                    stack.append((adj[node][k], 0))
            else:
                h, b = 0, -1
                for j in adj[node]:
                    if height[j] > h:
                        h, b = height[j], j
                height[node], best[node] = h + 1, b
                stack.pop()
    top = max(range(n), key=lambda i: height[i])
    chain = []
    node = top
    while node >= 0:
        chain.append(node)
        node = best[node]
    chain.reverse()  # from the module with no project imports up to Main

    # Number of modules that depend on each module, directly or through other modules.
    # Computed with Python integers as bitsets, processed in reverse topological order
    # and freed as soon as every importer has been handled.
    importers = [[] for _ in range(n)]
    for i, a in enumerate(adj):
        for j in a:
            importers[j].append(i)
    remaining = [len(a) for a in adj]
    by_height = sorted(range(n), key=lambda i: -height[i])
    rank = [0] * n  # bit position: modules nearest Main get the lowest bits, which keeps the integers short
    for pos, i in enumerate(by_height):
        rank[i] = pos
    bits = {}
    dependents = [0] * n
    for i in by_height:
        acc = 0
        for j in importers[i]:
            acc |= bits[j] | (1 << rank[j])
            remaining[j] -= 1
            if remaining[j] == 0:
                del bits[j]  # every module that j imports has now been counted
        dependents[i] = acc.bit_count()
        if adj[i]:
            bits[i] = acc

    # ---- field classifier: multinomial naive Bayes over each module's identifiers,
    # namespaces and keyword counts, trained on modules a language model read and
    # labelled (data/train). It replaces the keyword estimate; data/truth is kept
    # apart to measure it.
    base = os.path.dirname(labels_dir.rstrip("/"))
    keyword_stats = None
    random_counts = [0] * len(FIELDS)  # field given by the reading model, over every randomly sampled module
    train_key_path = os.path.join(base, "train", "key.json")
    trained = 0
    if os.path.exists(train_key_path):
        def features(r):
            f = Counter()
            for tok, c in r["tk"]:
                w = 1 + math.log(c)
                f["t:" + tok] += w
                if "." in tok:
                    f["h:" + tok.split(".")[0]] += w
            for ns in r["ns"]:
                for part in ns.split("."):
                    f["n:" + part] += 1
            for j, c in enumerate(r["fc"]):
                if c:
                    f["k:" + scan_fields[j]] += 1 + math.log(c)
            return f

        train_key, train_files = {}, []
        for folder in sorted(glob.glob(os.path.join(base, "train*"))):
            train_key.update(json.load(open(os.path.join(folder, "key.json"))))
            train_files += sorted(glob.glob(os.path.join(folder, "batch_*.json")))
        # modules that were picked to cover particular directories, not at random
        not_random = set()
        for path in glob.glob(os.path.join(base, "train*", "stratified.json")):
            not_random.update(json.load(open(path)))
        class_n, feat_n, total_n, vocab = Counter(), defaultdict(Counter), Counter(), set()
        for path in train_files:
            for entry in json.load(open(path)):
                i = index.get(train_key.get(entry.get("id"), ""))
                label = entry.get("field")
                if i is None or label not in scan_fields:
                    continue
                if rows[i]["p"] not in not_random:
                    random_counts[field_ids.index(label)] += 1
                trained += 1
                class_n[label] += 1
                for k, v in features(rows[i]).items():
                    feat_n[label][k] += v
                    total_n[label] += v
                    vocab.add(k)
        alpha = 0.5
        classes = sorted(class_n)
        log_prior = {c: math.log(class_n[c] / trained) for c in classes}
        log_default = {c: math.log(alpha / (total_n[c] + alpha * len(vocab))) for c in classes}
        log_feat = {c: {k: math.log((v + alpha) / (total_n[c] + alpha * len(vocab))) for k, v in feat_n[c].items()} for c in classes}
        keyword_snapshot = list(field_col)
        for i, r in enumerate(rows):
            f = features(r)
            if not f:
                continue
            best, best_score = None, -1e300
            for c in classes:
                table, default = log_feat[c], log_default[c]
                score = log_prior[c]
                for k, v in f.items():
                    score += v * table.get(k, default)
                if score > best_score:
                    best, best_score = c, score
            field_col[i] = field_ids.index(best)
        print("classifier trained on", trained, "modules")

    # ---- check against a random sample of modules whose field a language model judged
    # from the module text (data/truth). Reported on the page as the estimate's accuracy.
    family = {f[0]: f[2] for f in FIELDS}
    family.update({"combinatorics": "algebra", "computation": "algebra"})
    truth_stats = {"n": 0, "exact": 0, "family": 0, "familyOrSecond": 0, "dirExact": 0, "dirFamily": 0,
                   "keywordExact": 0, "keywordFamily": 0, "trained": trained}
    truth_counts = [0] * len(FIELDS)
    key_path = os.path.join(os.path.dirname(labels_dir.rstrip("/")), "truth", "key.json")
    if os.path.exists(key_path):
        key = json.load(open(key_path))
        for path in sorted(glob.glob(os.path.join(os.path.dirname(key_path), "batch_*.json"))):
            for entry in json.load(open(path)):
                i = index.get(key.get(entry["id"], ""))
                if i is None or entry.get("field") not in family:
                    continue
                truth_counts[field_ids.index(entry["field"])] += 1
                random_counts[field_ids.index(entry["field"])] += 1
                mine, theirs = field_ids[field_col[i]], field_ids[group_list[group_col[i]]["field"]]
                truth_stats["n"] += 1
                truth_stats["exact"] += mine == entry["field"]
                truth_stats["family"] += family[mine] == family[entry["field"]]
                truth_stats["familyOrSecond"] += family[mine] in (family[entry["field"]], family.get(entry.get("second")))
                if trained:
                    kw = field_ids[keyword_snapshot[i]]
                    truth_stats["keywordExact"] += kw == entry["field"]
                    truth_stats["keywordFamily"] += family[kw] == family[entry["field"]]
                truth_stats["dirExact"] += theirs == entry["field"]
                truth_stats["dirFamily"] += family[theirs] == family[entry["field"]]
        print("sample check:", truth_stats)

    regions, region_index = [], {}
    for r in rows:
        reg = region_of(r["p"])
        if reg not in region_index:
            region_index[reg] = len(regions)
            regions.append(reg)
    reg_of = [region_index[region_of(r["p"])] for r in rows]
    region_matrix = [[0] * len(regions) for _ in regions]
    nf = len(FIELDS)
    field_matrix = [[0] * nf for _ in range(nf)]
    # per module: which fields it imports from, and which fields import it (one bit per field)
    imports_fields = [0] * n
    imported_by_fields = [0] * n
    for i, a in enumerate(adj):
        for j in a:
            region_matrix[reg_of[i]][reg_of[j]] += 1
            field_matrix[field_col[i]][field_col[j]] += 1
            imports_fields[i] |= 1 << field_col[j]
            imported_by_fields[j] |= 1 << field_col[i]

    # ---- exact-shape clusters
    shape_count = Counter(r["sh"] for r in rows)

    # ---- which of the 24 most used tactics each module uses (one bit per tactic, in meta.tacticBits order)
    tactic_total = Counter()
    for r in rows:
        tactic_total.update(r["t"])
    tactic_bits = [name for name, _count in tactic_total.most_common() if name != "sorry"][:24]
    tactic_mask = [sum(1 << b for b, name in enumerate(tactic_bits) if r["t"].get(name)) for r in rows]

    # ---- columns
    def col(code, values):
        return array(code, values)

    columns = [
        ("bytes", "I", [r["b"] for r in rows]),
        ("lines", "I", [r["l"] for r in rows]),
        ("zbytes", "I", [r["z"] for r in rows]),
        ("dependents", "I", dependents),
        ("tactics", "I", tactic_mask),
        ("importsFields", "I", imports_fields),
        ("importedByFields", "I", imported_by_fields),
        ("decls", "H", [min(sum(r["d"].values()), 65535) for r in rows]),
        ("theorems", "H", [min(r["d"].get("theorem", 0) + r["d"].get("lemma", 0), 65535) for r in rows]),
        ("indeg", "H", [min(x, 65535) for x in indeg]),
        ("heartbeats", "H", [min(r["hb"] // 100000, 65535) for r in rows]),
        ("shape", "H", [min(shape_count[r["sh"]], 65535) for r in rows]),
        ("group", "H", list(group_col)),
        ("height", "B", [min(h, 255) for h in height]),
        ("kind", "B", [KINDS.index(r["k"]) for r in rows]),
        ("field", "B", list(field_col)),
        # share of the file that repeats the previous file in its directory, in percent (255 = first file)
        ("repeat", "B", [255 if r["zd"] < 0 else max(0, min(100, round(100 - 100 * r["zd"] / max(r["z"], 1)))) for r in rows]),
        # build time in tenths of a second (0 = not measured)
        ("build", "H", [min(65535, max(1, round(build_seconds[r["p"]] * 10))) if r["p"] in build_seconds else 0 for r in rows]),
        # numeric literals: how many, and how many per 100 lines
        ("literals", "H", [min(65535, r["nl"]) for r in rows]),
        ("literalRate", "B", [min(255, round(100 * r["nl"] / max(r["l"], 1))) for r in rows]),
        ("digits", "B", [min(100, round(100 * r["dg"] / max(r["b"], 1))) for r in rows]),
    ]
    layout, offset = [], 0
    with open(os.path.join(out, "cols.bin"), "wb") as fh:
        for name, code, values in columns:
            arr = col(code, values)
            pad = (-offset) % arr.itemsize
            fh.write(b"\0" * pad)
            offset += pad
            fh.write(arr.tobytes())
            layout.append({"name": name, "type": code, "offset": offset})
            offset += arr.itemsize * n
    with open(os.path.join(out, "names.txt"), "w") as fh:
        fh.write("\n".join(r["p"].split("/")[-1][:-5] for r in rows))

    # ---- term bitsets (the scanner matched each term against the text without import lines)
    terms = []
    with open(os.path.join(out, "terms.bin"), "wb") as fh:
        for t, (label, _pattern) in enumerate(TERMS):
            bitset = bytearray((n + 7) // 8)
            hits = 0
            for i, r in enumerate(rows):
                if (r["tm"] >> t) & 1:
                    bitset[i >> 3] |= 1 << (i & 7)
                    hits += 1
            if hits:
                terms.append({"label": label, "files": hits})
                fh.write(bitset)
            print(f"{hits:7d}  {label}")

    # ---- how often the keyword field agrees with the directory label, measured on
    # directories of at most 400 modules that the labelling model marked high confidence
    group_size = Counter(group_col)
    agree = judged = 0
    for i in range(n):
        g = group_list[group_col[i]]
        if g["confidence"] == "high" and group_size[group_col[i]] <= 400 and keyword_field[i] >= 0:
            judged += 1
            agree += family[field_ids[keyword_field[i]]] == family[field_ids[g["field"]]]
    print(f"keyword field agrees with directory label for {agree} of {judged} modules")

    tactics = Counter()
    decl_kinds = Counter()
    for r in rows:
        tactics.update(r["t"])
        decl_kinds.update(r["d"])
    meta = {
        "files": n,
        "fields": [{"id": f[0], "name": f[1], "family": [x[0] for x in FAMILIES].index(f[2])} for f in FIELDS],
        "families": [{"id": f[0], "name": f[1]} for f in FAMILIES],
        "kinds": KINDS,
        "dirs": [[d["n"], d["p"], d["s"], d["f"], d["e"]] for d in dirs],
        "groups": group_list,
        "columns": layout,
        "regions": regions,
        "regionMatrix": region_matrix,
        "fieldMatrix": field_matrix,
        "chain": chain,
        "terms": terms,
        "tactics": tactics.most_common(),
        "tacticBits": tactic_bits,
        "declKinds": decl_kinds.most_common(),
        "totals": {
            "bytes": sum(r["b"] for r in rows),
            "lines": sum(r["l"] for r in rows),
            "zbytes": sum(r["z"] for r in rows),
            "commentBytes": sum(r["cb"] for r in rows),
            "importEdges": sum(len(a) for a in adj),
            "wholeMathlibImports": sum("Mathlib" in r["i"] for r in rows),
            "longestChain": len(chain),
            "literals": sum(r["nl"] for r in rows),
            "longLiterals": sum(r["ln"] for r in rows),
            "modulesWithLongLiterals": sum(1 for r in rows if r["ln"]),
            "buildSeconds": round(sum(build_seconds.values())),
            "buildMeasured": len(build_seconds),
            "fieldByKeywords": by_keywords,
            "fieldAgree": agree,
            "fieldJudged": judged,
            "truth": truth_stats,
            "truthCounts": truth_counts,
            "randomCounts": random_counts,
            "randomN": sum(random_counts),
            "labelledGroups": sum(1 for g in group_list if g["confidence"]),
        },
    }
    with open(os.path.join(out, "meta.json"), "w") as fh:
        json.dump(meta, fh, ensure_ascii=False, separators=(",", ":"))
    print(n, "files,", len(dirs), "directories,", len(group_list), "groups,", len(labels), "labels")
    for name in ("meta.json", "cols.bin", "names.txt", "terms.bin"):
        path = os.path.join(out, name)
        if os.path.exists(path):
            print(f"{os.path.getsize(path):10d}  {name}")


if __name__ == "__main__":
    main()
