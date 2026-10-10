#!/usr/bin/env python3
"""Read-only catalog audit and matching benchmark for Laria's canonical catalog.

    pip install "psycopg[binary]"
    export CATALOG_DSN="postgresql://...?sslmode=require"     # any Postgres with the catalog migrations + data
    python3 docs/catalog-audit/bench/catalog_audit.py all --label prod-2026-10-10 --out docs/catalog-audit/results/prod

Subcommands: `match` (corpus benchmark), `integrity` (data checks), `autofill` (coverage matrix), `all`.

Safety
  * every session is `default_transaction_read_only = on`, every statement has a timeout, and the work runs inside a
    transaction that is rolled back at the end: the script cannot write, even by mistake;
  * it calls catalog_lookup / catalog_match / catalog_jev_inputs only. It never calls catalog_search_logged() (which
    writes catalog_search_log), migrations, loaders or admin RPCs;
  * integrity queries are aggregates or bounded samples (LIMIT); --max-cases bounds the benchmark.
Against production, prefer a read replica or the local stack loaded with the same build (same catalog_products comment).

Scoring rules are in docs/catalog-audit/catalog-quality-audit.md (Methodology). In short: expected identities are resolved
to product ids at run time from (manufacturer alias, model key / alias key); a case whose identity does not resolve is
reported as `label_unresolved` and excluded from recall and accuracy denominators, never counted as a miss.
"""
import argparse
import json
import os
import statistics
import sys
import time
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "corpus"))
sys.path.insert(0, HERE)

from identities import FAMILIES, IDENTITIES  # noqa: E402
from integrity_checks import AUTOFILL, BY_BRAND, CHECKS  # noqa: E402

# spellings under which a manufacturer may be registered (the runner tries each alias key)
MFR_ALTS = {
    "ESP": ["ESP", "LTD", "ESP LTD"],
    "RØDE": ["RØDE", "Rode"],
    "Ernie Ball Music Man": ["Ernie Ball Music Man", "Music Man", "Ernie Ball"],
    "ProCo": ["ProCo", "Pro Co", "Pro Co Sound"],
    "Electro-Harmonix": ["Electro-Harmonix", "EHX"],
    "Audio-Technica": ["Audio-Technica", "Audio Technica"],
    "Line 6": ["Line 6", "Line6"],
    "Universal Audio": ["Universal Audio", "UA"],
}


def connect(dsn, timeout_ms, jit=None):
    import psycopg
    opts = f"-c default_transaction_read_only=on -c statement_timeout={timeout_ms}"
    if jit:  # by default the server's setting is measured; --jit off/on overrides it for this session only
        opts += f" -c jit={jit}"
    conn = psycopg.connect(dsn, autocommit=False, options=opts)
    conn.execute("set transaction read only")
    return conn


def rows(conn, sql, params=None):
    cur = conn.execute(sql, params)
    cols = [d.name for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def jsonable(v):
    if isinstance(v, (list, tuple)):
        return [jsonable(x) for x in v]
    if isinstance(v, dict):
        return {k: jsonable(x) for k, x in v.items()}
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    return str(v)


# ------------------------------------------------------------------------------------------------ identity resolution
def resolve_identities(conn):
    """identity key -> {ids: [...], method, names}; never guesses beyond exact keys."""
    out = {}
    allrows = [(k, mfr, model, keys, "model") for k, _c, mfr, model, keys, *_ in IDENTITIES]
    allrows += [(k, mfr, name, keys, "family") for k, _c, mfr, name, keys in FAMILIES]
    for key, mfr, model, keys, level in allrows:
        mkeys = list(keys)
        found = rows(conn, """
            with mf as (select distinct ma.manufacturer_id from catalog_manufacturer_aliases ma
                        where ma.alias_key = any(select catalog_compact(x) from unnest(%s::text[]) x)),
                 k as (select unnest(%s::text[]) as key union select catalog_compact(%s))
            select p.id, p.canonical_model_name, p.entity_level, 'model_key' as method
            from catalog_products p where p.superseded_at is null and p.manufacturer_id in (select * from mf)
              and p.model_key in (select key from k)
            union
            select p.id, p.canonical_model_name, p.entity_level, 'alias_key'
            from catalog_products p join catalog_product_aliases a on a.product_id = p.id
            where p.superseded_at is null and p.manufacturer_id in (select * from mf)
              and a.alias_key in (select key from k) and coalesce(a.source_id, '') not like 'retail\\_%%'
        """, (MFR_ALTS.get(mfr, [mfr]), mkeys, model))
        by_id = {}
        for r in found:
            if r["id"] not in by_id or r["method"] == "model_key":
                by_id[r["id"]] = r
        # prefer exact model_key hits; family identities prefer family entities, model identities model entities
        cands = list(by_id.values())
        exact = [r for r in cands if r["method"] == "model_key"] or cands
        lvl = [r for r in exact if r["entity_level"] == level] or exact
        out[key] = {
            "ids": [str(r["id"]) for r in lvl],
            "names": [r["canonical_model_name"] for r in lvl],
            "levels": [r["entity_level"] for r in lvl],
            "method": lvl[0]["method"] if lvl else None,
            "ambiguous": len(lvl) > 1,
        }
    return out


# ------------------------------------------------------------------------------------------------ benchmark
def timed(conn, sql, params):
    t0 = time.perf_counter()
    res = rows(conn, sql, params)
    return res, (time.perf_counter() - t0) * 1000.0


def run_match(conn, corpus_path, max_cases, k_max=8):
    cases = [json.loads(line) for line in open(corpus_path, encoding="utf-8")]
    if max_cases:
        cases = cases[:max_cases]
    ident = resolve_identities(conn)
    results = []
    # warm-up so the first case does not carry plan/cache cost
    rows(conn, "select * from catalog_match('boss ds-1', null)")
    for c in cases:
        q, hint = c["input"], c["manufacturer_hint"]
        lk, t_lookup = timed(conn, "select * from catalog_lookup(%s, %s, %s)", (q, hint, k_max))
        mt, t_match = timed(conn, "select * from catalog_match(%s, %s)", (q, hint))
        jv, t_jev = timed(conn, "select * from catalog_jev_inputs(%s, %s)", (q, hint))
        exp = c["expected"]
        exp_ids, exp_acc = [], []
        if exp["identity"] and exp["identity"] in ident:
            exp_ids = ident[exp["identity"]]["ids"]
        for a in exp["accept"]:
            exp_acc += ident.get(a, {}).get("ids", [])
        m = mt[0] if mt else {}
        j = jv[0] if jv else {}
        results.append({
            "id": c["id"], "input": q, "hint": hint, "expected": exp, "safe": c["safe_behavior"], "origin": c["origin"],
            "cat": c["instrument_category"], "tests": c["tests"], "ambiguity": c["ambiguity"],
            "needs_human_review": c["needs_human_review"],
            "expected_ids": exp_ids, "accepted_ids": exp_acc,
            "lookup": [{"rank": i + 1, "product_id": str(r["product_id"]), "manufacturer": r["manufacturer"],
                        "model": r["model"], "entity_level": r["entity_level"], "match_type": r["match_type"],
                        "warning": r["warning"], "score": float(r["score"]) if r["score"] is not None else None}
                       for i, r in enumerate(lk)],
            "match": jsonable(m), "jev": jsonable(j),
            "jev_bytes": len(json.dumps(jsonable(j), ensure_ascii=False).encode()),
            "ms": {"lookup": t_lookup, "match": t_match, "jev": t_jev},
        })
    return ident, results


def pct(a, b):
    return None if not b else round(100.0 * a / b, 1)


def score(results):
    """Metrics with explicit denominators. Returns (summary dict, per-case verdicts)."""
    S = {}
    verdicts = []
    for r in results:
        exp = r["expected"]
        kind, safe = exp["kind"], r["safe"]
        ids = set(r["expected_ids"]) or set(r["accepted_ids"])
        top = [x["product_id"] for x in r["lookup"]]
        m = r["match"]
        tier, dec, pid = m.get("tier"), m.get("decision"), m.get("product_id")
        v = {"id": r["id"], "kind": kind, "safe": safe, "tier": tier, "decision": dec, "origin": r["origin"],
             "cat": r["cat"], "resolved": bool(ids)}
        if kind == "model" and ids:
            v["r1"] = any(x in ids for x in top[:1])
            v["r3"] = any(x in ids for x in top[:3])
            v["r5"] = any(x in ids for x in top[:5])
        if kind == "model" and safe == "AUTO_OK" and ids:
            v["correct"] = dec == "MATCH" and tier == "AUTO" and pid in ids
            v["auto_coverage"] = tier == "AUTO" and pid in ids
        elif kind == "family":
            fam_ids = ids
            v["correct"] = tier != "AUTO" and (not fam_ids or pid in fam_ids or dec in ("FAMILY", "CONFLICTING", "INSUFFICIENT"))
        elif safe == "NO_AUTO":
            v["correct"] = tier != "AUTO"
        elif kind == "unresolved":
            v["correct"] = tier == "INSUFFICIENT"
        # safety: an AUTO that is wrong, or AUTO where the case forbids it
        if tier == "AUTO":
            if safe != "AUTO_OK":
                v["unsafe_auto"] = "auto_where_forbidden"
            elif ids and pid not in ids:
                v["unsafe_auto"] = "auto_wrong_product"
            elif not ids:
                v["unsafe_auto"] = "unjudged_label_unresolved"
        # family / model confusion
        if kind == "model" and pid and m.get("entity_level") == "family":
            v["confusion"] = "model_expected_family_returned"
        if kind == "family" and tier == "AUTO":
            v["confusion"] = "family_expected_model_auto"
        verdicts.append(v)

    def block(vs):
        known = [v for v in vs if v["kind"] == "model" and v["resolved"]]
        auto_ok = [v for v in vs if v["kind"] == "model" and v["safe"] == "AUTO_OK" and v["resolved"]]
        no_auto = [v for v in vs if v["safe"] in ("NO_AUTO", "INSUFFICIENT")]
        ooc = [v for v in vs if v["kind"] == "unresolved"]
        judged = [v for v in vs if "correct" in v]
        return {
            "cases": len(vs),
            "known_model_cases_resolved": len(known),
            "label_unresolved_model_cases": sum(1 for v in vs if v["kind"] == "model" and not v["resolved"]),
            "recall@1": pct(sum(v["r1"] for v in known), len(known)),
            "recall@3": pct(sum(v["r3"] for v in known), len(known)),
            "recall@5": pct(sum(v["r5"] for v in known), len(known)),
            "resolution_accuracy": pct(sum(v["correct"] for v in judged), len(judged)),
            "resolution_denominator": len(judged),
            "auto_coverage_on_AUTO_OK": pct(sum(v.get("auto_coverage", False) for v in auto_ok), len(auto_ok)),
            "auto_ok_denominator": len(auto_ok),
            "unsafe_auto": sum(1 for v in vs if v.get("unsafe_auto") in ("auto_where_forbidden", "auto_wrong_product")),
            "unsafe_auto_rate_on_no_auto_cases": pct(sum(1 for v in no_auto if v.get("unsafe_auto")), len(no_auto)),
            "no_auto_denominator": len(no_auto),
            "auto_wrong_product": sum(1 for v in vs if v.get("unsafe_auto") == "auto_wrong_product"),
            "auto_unjudged": sum(1 for v in vs if v.get("unsafe_auto") == "unjudged_label_unresolved"),
            "family_model_confusion": sum(1 for v in vs if v.get("confusion")),
            "ooc_cases": len(ooc),
            "ooc_tiers": dict(Counter(v["tier"] for v in ooc)),
            "tiers": dict(Counter(v["tier"] for v in vs)),
            "decisions": dict(Counter(v["decision"] for v in vs)),
        }

    S["overall"] = block(verdicts)
    S["by_origin"] = {o: block([v for v in verdicts if v["origin"] == o]) for o in sorted({v["origin"] for v in verdicts})}
    S["by_category"] = {c: block([v for v in verdicts if v["cat"] == c]) for c in sorted({str(v["cat"]) for v in verdicts})}
    amb = defaultdict(list)
    for r, v in zip(results, verdicts):
        amb[r["ambiguity"]].append(v)
    S["by_ambiguity"] = {a: block(vs) for a, vs in sorted(amb.items())}
    # conflict detection: contradiction / variant-ambiguous cases should not reach AUTO
    conf = [v for r, v in zip(results, verdicts) if r["ambiguity"] in ("contradiction", "variant_ambiguous")]
    S["conflict_detection"] = {"cases": len(conf), "not_auto": sum(1 for v in conf if v["tier"] != "AUTO"),
                               "decisions": dict(Counter(v["decision"] for v in conf))}
    # latency
    lat = {}
    for fn in ("lookup", "match", "jev"):
        xs = sorted(r["ms"][fn] for r in results)
        if xs:
            lat[fn] = {"p50_ms": round(statistics.median(xs), 1), "p95_ms": round(xs[int(0.95 * (len(xs) - 1))], 1),
                       "max_ms": round(xs[-1], 1), "n": len(xs)}
    S["latency"] = lat
    # jev payload
    jb = [r["jev_bytes"] for r in results]
    S["jev_payload"] = {
        "avg_bytes": round(statistics.mean(jb), 1) if jb else None, "max_bytes": max(jb) if jb else None,
        "null_rate": {k: pct(sum(1 for r in results if r["jev"].get(k) in (None, [], "")), len(results))
                      for k in (results[0]["jev"].keys() if results else [])},
        "decision_vs_tier": dict(Counter(f'{r["jev"].get("decision")}/{r["jev"].get("tier")}' for r in results)),
    }
    return S, verdicts


# ------------------------------------------------------------------------------------------------ integrity / autofill
def run_integrity(conn, sample=15):
    out = []
    for cid, title, kind, sev, sql in CHECKS:
        t0 = time.perf_counter()
        try:
            n = rows(conn, f"select count(*) as n from ({sql}) s")[0]["n"]
            smp = rows(conn, f"select * from ({sql}) s limit {int(sample)}")
            err = None
        except Exception as e:  # noqa: BLE001 - report the failing check and keep going
            conn.rollback()
            conn.execute("set transaction read only")
            n, smp, err = None, [], str(e).splitlines()[0]
        out.append({"id": cid, "title": title, "kind": kind, "severity": sev, "n": n, "sample": jsonable(smp),
                    "error": err, "ms": round((time.perf_counter() - t0) * 1000, 1)})
    try:
        by_brand = jsonable(rows(conn, BY_BRAND))
    except Exception as e:  # noqa: BLE001
        conn.rollback()
        conn.execute("set transaction read only")
        by_brand = [{"error": str(e).splitlines()[0]}]
    return out, by_brand


def run_autofill(conn):
    return jsonable(rows(conn, AUTOFILL))


# ------------------------------------------------------------------------------------------------ report
def write(out_dir, name, obj):
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, name)
    with open(path, "w", encoding="utf-8") as fh:
        if name.endswith(".jsonl"):
            for x in obj:
                fh.write(json.dumps(x, ensure_ascii=False, default=str) + "\n")
        else:
            json.dump(obj, fh, ensure_ascii=False, indent=1, default=str)
    return path


def md_summary(label, S, ident, integrity, by_brand):
    L = [f"# Benchmark results: {label}", ""]
    if S:
        o = S["overall"]
        L += ["## Matching (corpus)", "",
              "| Metric | Value | Denominator |", "| --- | ---: | ---: |",
              f"| Recall@1 / @3 / @5 (known, resolved model cases) | {o['recall@1']} / {o['recall@3']} / {o['recall@5']} % | {o['known_model_cases_resolved']} |",
              f"| Resolution accuracy (all judged cases) | {o['resolution_accuracy']} % | {o['resolution_denominator']} |",
              f"| AUTO coverage on AUTO_OK cases | {o['auto_coverage_on_AUTO_OK']} % | {o['auto_ok_denominator']} |",
              f"| Unsafe AUTO (forbidden or wrong product) | {o['unsafe_auto']} | {o['cases']} |",
              f"| Unsafe AUTO rate on NO_AUTO/INSUFFICIENT cases | {o['unsafe_auto_rate_on_no_auto_cases']} % | {o['no_auto_denominator']} |",
              f"| AUTO on a wrong product | {o['auto_wrong_product']} | - |",
              f"| AUTO that cannot be judged (label unresolved) | {o['auto_unjudged']} | - |",
              f"| Family / model confusion | {o['family_model_confusion']} | {o['cases']} |",
              f"| Model cases whose label did not resolve (excluded) | {o['label_unresolved_model_cases']} | - |",
              f"| Out-of-catalog tiers | {o['ooc_tiers']} | {o['ooc_cases']} |",
              f"| Conflict cases kept from AUTO | {S['conflict_detection']['not_auto']} | {S['conflict_detection']['cases']} |",
              ""]
        L += ["### By origin", "", "| Origin | Cases | R@1 | R@3 | Accuracy | Unsafe AUTO |", "| --- | ---: | ---: | ---: | ---: | ---: |"]
        for k, b in S["by_origin"].items():
            L.append(f"| {k} | {b['cases']} | {b['recall@1']} | {b['recall@3']} | {b['resolution_accuracy']} | {b['unsafe_auto']} |")
        L += ["", "### By category", "", "| Category | Cases | Resolved model cases | R@1 | R@3 | Accuracy | AUTO coverage | Unsafe AUTO |",
              "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"]
        for k, b in S["by_category"].items():
            L.append(f"| {k} | {b['cases']} | {b['known_model_cases_resolved']} | {b['recall@1']} | {b['recall@3']} | "
                     f"{b['resolution_accuracy']} | {b['auto_coverage_on_AUTO_OK']} | {b['unsafe_auto']} |")
        L += ["", "### Latency (ms, client-measured, includes network)", "", "| Function | p50 | p95 | max | n |", "| --- | ---: | ---: | ---: | ---: |"]
        for k, x in S["latency"].items():
            L.append(f"| {k} | {x['p50_ms']} | {x['p95_ms']} | {x['max_ms']} | {x['n']} |")
        L += ["", "### Jev payload", "", f"Average {S['jev_payload']['avg_bytes']} bytes, max {S['jev_payload']['max_bytes']}.",
              f"Decision/tier pairs: {S['jev_payload']['decision_vs_tier']}", ""]
    if ident:
        unres = [k for k, v in ident.items() if not v["ids"]]
        amb = [k for k, v in ident.items() if v["ambiguous"]]
        L += ["## Identity resolution", "", f"{len(ident) - len(unres)} of {len(ident)} corpus identities resolved to a product; "
              f"{len(amb)} resolved to more than one product.", "",
              "Unresolved: " + (", ".join(unres) if unres else "none"), "",
              "Ambiguous: " + (", ".join(amb) if amb else "none"), ""]
    if integrity:
        L += ["## Integrity checks", "",
              "Defect checks count problem rows (0 = clean). `permissible` checks are distributions: their count is a number of "
              "table rows, not of problems.", "",
              "| Check | Kind | Severity | Rows |", "| --- | --- | --- | ---: |"]
        for c in integrity:
            L.append(f"| {c['id']}: {c['title']} | {c['kind']} | {c['severity']} | {c['n'] if c['error'] is None else 'ERROR ' + c['error']} |")
        L.append("")
    if by_brand:
        L += ["## Issues by brand (top 40)", "", "```", json.dumps(by_brand[:40], ensure_ascii=False, indent=0, default=str)[:6000], "```", ""]
    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["match", "integrity", "autofill", "all"])
    ap.add_argument("--dsn", default=os.environ.get("CATALOG_DSN"))
    ap.add_argument("--corpus", default=os.path.join(HERE, "..", "corpus", "catalog_eval_corpus.jsonl"))
    ap.add_argument("--out", required=True)
    ap.add_argument("--label", required=True, help="what was measured, e.g. 'fixture-smoke' or 'prod-replica-2026-10-11'")
    ap.add_argument("--max-cases", type=int, default=0)
    ap.add_argument("--timeout-ms", type=int, default=10000)
    ap.add_argument("--jit", choices=["on", "off"], default=None,
                    help="override the session's jit setting (default: measure the server as configured)")
    a = ap.parse_args()
    if not a.dsn:
        sys.exit("set --dsn or CATALOG_DSN")
    conn = connect(a.dsn, a.timeout_ms, a.jit)
    S = ident = integrity = by_brand = None
    try:
        meta = rows(conn, "select current_database() as db, version() as version, "
                          "obj_description('public.catalog_products'::regclass) as build, now() as at, "
                          "current_setting('jit') as jit, current_setting('jit_above_cost') as jit_above_cost")[0]
        write(a.out, "meta.json", {"label": a.label, **jsonable(meta)})
        if a.command in ("match", "all"):
            ident, results = run_match(conn, a.corpus, a.max_cases)
            S, verdicts = score(results)
            write(a.out, "identity_resolution.json", ident)
            write(a.out, "cases.jsonl", results)
            write(a.out, "verdicts.jsonl", verdicts)
            write(a.out, "summary.json", S)
        if a.command in ("integrity", "all"):
            integrity, by_brand = run_integrity(conn)
            write(a.out, "integrity.json", integrity)
            write(a.out, "integrity_by_brand.json", by_brand)
        if a.command in ("autofill", "all"):
            write(a.out, "autofill_coverage.json", run_autofill(conn))
    finally:
        conn.rollback()
        conn.close()
    with open(os.path.join(a.out, "summary.md"), "w", encoding="utf-8") as fh:
        fh.write(md_summary(a.label, S, ident, integrity, by_brand))
    print(open(os.path.join(a.out, "summary.md"), encoding="utf-8").read()[:4000])


if __name__ == "__main__":
    main()
