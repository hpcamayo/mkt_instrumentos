"""One-time explicit import. Never infer acceptance statuses or sprint ownership."""

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

from registry import ROOT, cases_from_xlsx, read_xlsx, sheet_rows, write_cases


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output-dir", type=Path, default=ROOT)
    args = parser.parse_args()
    destinations = [args.output_dir / name for name in ("cases.tsv", "workbook_metadata.json")]
    if any(path.exists() for path in destinations):
        parser.error("Canonical data already exists; import into a separate directory for comparison")
    data = args.source.read_bytes()
    book = read_xlsx(data)
    if set(book) != {"Acceptance Matrix", "Coverage Summary", "Test Personas", "Spec Traceability"}:
        parser.error("Unexpected workbook sheets; review before migration")
    cases = cases_from_xlsx(book)
    for name in ("Test Personas", "Spec Traceability"):
        if book[name]["formulas"]:
            parser.error(f"{name} contains formulas; review before migration")
        if any(re.sub(r"\d+$", "", address) not in ("A", "B", "C", "D") and value
               for address, value in book[name]["cells"].items()):
            parser.error(f"{name} has unexpected columns; review before migration")
    metadata = {
        "source_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT.parent, text=True).strip(),
        "source_sha256": hashlib.sha256(data).hexdigest(),
        "matrix_widths": book["Acceptance Matrix"]["widths"] + [14],
        "summary_title": book["Coverage Summary"]["cells"]["A1"],
        "summary_domains": [row[3] for row in sheet_rows(book["Coverage Summary"], 6)
                            if row[3] and row[3] != "Domain"],
        "support_sheets": [{"name": name, "widths": book[name]["widths"],
                            "rows": sheet_rows(book[name], 4)}
                           for name in ("Test Personas", "Spec Traceability")],
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    write_cases(cases, destinations[0])
    destinations[1].write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(cases)} cases, preserving all 16 source fields; owner_sprint left blank.")


if __name__ == "__main__":
    main()
