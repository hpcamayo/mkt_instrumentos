"""Validate canonical TSV; XLSX comparison is opt-in for the final freeze gate."""

import argparse
import hashlib
import subprocess
from collections import Counter
from pathlib import Path

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


def validate(cases_path=ROOT / "cases.tsv", workbook_path=None, metadata_path=ROOT / "workbook_metadata.json", original=None):
    cases = load_cases(cases_path)
    if workbook_path is None and original is None:
        print(f"PASS: {len(cases)} cases; canonical TSV valid; no duplicate IDs.")
        print("Statuses:", dict(sorted(Counter(case["status"] for case in cases).items())))
        return
    from generate_xlsx import summary_rows

    metadata = load_metadata(metadata_path)
    expected_summary = [[str(value) for value in row] for row in summary_rows(cases, metadata)]
    if workbook_path is not None:
        validate_workbook(cases, workbook_path, metadata, expected_summary)
    if original is not None:
        validate_original(cases, original, metadata, expected_summary)
    print(f"PASS: {len(cases)} cases; no duplicate IDs; requested archival/workbook comparisons equal.")
    print("Statuses:", dict(sorted(Counter(case["status"] for case in cases).items())))


def validate_workbook(cases, workbook_path, metadata, expected_summary):
    book = read_xlsx(workbook_path)
    if list(book) != ["Acceptance Matrix", "Coverage Summary", "Test Personas", "Spec Traceability"]:
        raise ValueError("Generated workbook sheet names/order changed")
    compare(cases, cases_from_xlsx(book, generated=True), "TSV → XLSX")
    if sheet_rows(book["Coverage Summary"], 6) != expected_summary:
        raise ValueError("Generated summary differs from current registry counts")
    for sheet in metadata["support_sheets"]:
        if sheet_rows(book[sheet["name"]], 4) != sheet["rows"]:
            raise ValueError(f"Generated {sheet['name']} content changed")


def validate_original(cases, original, metadata, expected_summary):
    if original is not None:
        data = original if isinstance(original, bytes) else Path(original).read_bytes()
        if hashlib.sha256(data).hexdigest() != metadata["source_sha256"]:
            raise ValueError("Original workbook does not match recorded migration source")
        source = read_xlsx(data)
        compare(cases_from_xlsx(source), cases, "Original XLSX → TSV")
        for sheet in metadata["support_sheets"]:
            if sheet_rows(source[sheet["name"]], 4) != sheet["rows"]:
                raise ValueError(f"Original {sheet['name']} content changed")
        current = dict(zip((row[0] for row in expected_summary[3:]), (row[1] for row in expected_summary[3:])))
        for row in sheet_rows(source["Coverage Summary"], 6)[3:]:
            if row[0] and current.get(row[0]) != row[1]:
                raise ValueError(f"Original summary mismatch: {row[0]}")
        print("Original → TSV: all 16 fields, exact IDs/order/count and supporting sheets preserved.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path, default=ROOT / "cases.tsv")
    parser.add_argument("--workbook", type=Path, help="Opt-in XLSX comparison at the final V1 freeze gate only")
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
