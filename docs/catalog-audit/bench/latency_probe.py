#!/usr/bin/env python3
"""Read-only latency probe: catalog_match() time vs title length, with the session's JIT off and on.

    python3 latency_probe.py --dsn "$CATALOG_DSN" [--max-tokens 96]

On the smoke fixture (PostgreSQL 16, 151 products) every call with jit=on cost ~5 s of JIT compilation; see the audit
report. Run it against the production build (a replica or the local stack) before relying on the numbers.
"""
import argparse
import os
import statistics
import time

import psycopg

WORDS = ("vendo guitarra fender player stratocaster hss mexicana con funda y cable en perfecto estado 10/10 cambio por "
         "pedal boss ds1 o amplificador").split()

ap = argparse.ArgumentParser()
ap.add_argument("--dsn", default=os.environ.get("CATALOG_DSN"))
ap.add_argument("--max-tokens", type=int, default=96)
a = ap.parse_args()
for jit in ("off", "on"):
    c = psycopg.connect(a.dsn, options=f"-c jit={jit} -c default_transaction_read_only=on -c statement_timeout=30000")
    c.execute("select * from catalog_match('boss ds1')").fetchall()
    n = 3
    while n <= a.max_tokens:
        q = " ".join((WORDS * 20)[:n])
        ts = []
        for _ in range(3):
            t = time.perf_counter()
            c.execute("select * from catalog_match(%s, null)", (q,)).fetchall()
            ts.append((time.perf_counter() - t) * 1000)
        print(f"jit={jit} tokens={n:3d} chars={len(q):4d} catalog_match_ms_median={statistics.median(ts):8.1f}")
        n *= 2
    c.rollback()
    c.close()
