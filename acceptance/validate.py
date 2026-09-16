"""Validate the registry/generated workbook, optionally against the migration source."""

import argparse
import hashlib
import subprocess
from collections import Counter
from pathlib import Path

from generate_xlsx import summary_rows
from registry import FIELDS, ROOT, cases_from_xlsx, load_cases, load_metadata, read_xlsx, sheet_rows


def compare(expected, actual, label):
    if len(expected) != len(actual):
        raise ValueError(f"{label}: row count mismatch")
    left, right = {case["id"]: case for case in expected}, {case["id"]: case for case in actual}
    if left.keys() != right.keys():
        raise ValueError(f"{label}: Test ID set mismatch")
    if [case["id"] for case in expected] != [case["id"] for case in actual]:
        raise ValueError(f"{label}: Test ID order mismatch")
    for identifier in left:
        for field in FIELDS:
            if left[identifier][field] != right[identifier][field]:
                raise ValueError(f"{label}: {identifier} {field} changed")


def validate(cases_path, workbook_path, metadata_path, original=None):
    cases, metadata = load_cases(cases_path), load_metadata(metadata_path)
    book = read_xlsx(workbook_path)
    if list(book) != ["Acceptance Matrix", "Coverage Summary", "Test Personas", "Spec Traceability"]:
        raise ValueError("Generated workbook sheet names/order changed")
    compare(cases, cases_from_xlsx(book, generated=True), "TSV → XLSX")
    expected_summary = [[str(value) for value in row] for row in summary_rows(cases, metadata)]
    if sheet_rows(book["Coverage Summary"], 6) != expected_summary:
        raise ValueError("Generated summary differs from current registry counts")
    for sheet in metadata["support_sheets"]:
        if sheet_rows(book[sheet["name"]], 4) != sheet["rows"]:
            raise ValueError(f"Generated {sheet['name']} content changed")
    if original is not None:
        data = original if isinstance(original, bytes) else Path(original).read_bytes()
        if hashlib.sha256(data).hexdigest() != metadata["source_sha256"]:
            raise ValueError("Original workbook does not match recorded migration source")
        source = read_xlsx(data)
        compare(cases_from_xlsx(source), cases, "Original XLSX → TSV")
        for sheet in metadata["support_sheets"]:
            if sheet_rows(source[sheet["name"]], 4) != sheet["rows"]:
                raise ValueError(f"Original {sheet['name']} content changed")
        summary = source["Coverage Summary"]["cells"]
        current = dict(zip((row[0] for row in expected_summary[3:]), (row[1] for row in expected_summary[3:])))
        for row in sheet_rows(source["Coverage Summary"], 6)[3:]:
            if row[0] and current.get(row[0]) != row[1]:
                raise ValueError(f"Original summary mismatch: {row[0]}")
        print("Original → TSV: all 16 fields, exact IDs/order/count and supporting sheets preserved.")
    print(f"PASS: {len(cases)} cases; no duplicate IDs; TSV/generated XLSX equal.")
    print("Statuses:", dict(sorted(Counter(case["status"] for case in cases).items())))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path, default=ROOT / "cases.tsv")
    parser.add_argument("--workbook", type=Path, default=ROOT.parent / "acceptance_matrix.xlsx")
    parser.add_argument("--metadata", type=Path, default=ROOT / "workbook_metadata.json")
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--original", type=Path)
    source.add_argument("--baseline-git", action="store_true", help="Compare the exact migration-time workbook from local Git")
    args = parser.parse_args()
    original = args.original
    if args.baseline_git:
        revision = load_metadata(args.metadata)["source_commit"]
        original = subprocess.check_output(["git", "show", f"{revision}:acceptance_matrix.xlsx"], cwd=ROOT.parent)
    try:
        validate(args.cases, args.workbook, args.metadata, original)
    except ValueError as error:
        parser.exit(1, f"FAIL: {error}\n")
