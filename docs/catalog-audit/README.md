# Catalog quality audit (2026-10-10)

An independent, read-only audit of the canonical catalog's matching functions, with a reusable benchmark. It is not
application code. Nothing here is imported by the app, changes a migration, or writes to a database.

| File | What it is |
| --- | --- |
| `catalog-quality-audit.md` | The report: assessment, method, findings by severity, corrections, autofill and Jev readiness, limitations |
| `jev-autofill-handoff.md` | Short handoff to the autofill / Jev prototype |
| `autofill-readiness-matrix.csv` | V1 listing attributes × stability class × prefill / withhold rule |
| `corpus/catalog_eval_corpus.jsonl` | 311 test cases (seller-style input, hint, expected identity or unresolved, ambiguity, tests, safe behaviour, origin, grounding, review flag) |
| `corpus/identities.py`, `corpus/build_corpus.py` | Source of the corpus; `python3 corpus/build_corpus.py` regenerates it deterministically |
| `corpus/grounding.json` | Web check of the 121 product identities (exists, maker's spelling, status, one reference URL) |
| `bench/catalog_audit.py` | Read-only runner: `match` (benchmark), `integrity` (43 checks), `autofill` (coverage), `all` |
| `bench/integrity_checks.py` | The integrity, by-brand and autofill-coverage SQL |
| `bench/latency_probe.py` | Latency vs title length, with JIT off and on |
| `bench/fixture/` | Synthetic smoke fixture with seeded defects (not Laria data) |
| `results/fixture-smoke/` | Output of the runner on the fixture (synthetic; it validates the tooling, not the catalog) |

Run against the production build (a read replica, or the local stack loaded with the same build):

```sh
python3 -m pip install "psycopg[binary]"
export CATALOG_DSN="postgresql://…"
python3 docs/catalog-audit/bench/catalog_audit.py all --label prod-<build> --out docs/catalog-audit/results/prod-<build>
python3 docs/catalog-audit/bench/latency_probe.py
```
