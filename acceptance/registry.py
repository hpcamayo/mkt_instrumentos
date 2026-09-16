"""Acceptance TSV codec and lossless XLSX inspection (Python standard library)."""

import io
import json
import posixpath
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent
FIELDS = (
    "id", "domain", "priority", "release_gate", "status", "requirement",
    "expected", "evidence", "owner_sprint", "subdomain", "preconditions",
    "steps", "actor", "test_level", "automation", "spec_ref", "baseline_impl",
)
# Keep the original human-facing column names/order; append the new optional field.
XLSX_COLUMNS = (
    ("Test ID", "id"), ("Domain", "domain"), ("Subdomain", "subdomain"),
    ("Scenario", "requirement"), ("Preconditions", "preconditions"),
    ("Steps", "steps"), ("Expected Result", "expected"), ("Actor", "actor"),
    ("Test Level", "test_level"), ("Automation", "automation"),
    ("Priority", "priority"), ("Release Gate", "release_gate"),
    ("Spec Ref", "spec_ref"), ("Baseline Impl.", "baseline_impl"),
    ("Execution Status", "status"), ("Evidence / Notes", "evidence"),
    ("Owner Sprint", "owner_sprint"),
)
STATUSES = ("Not Run", "Pass", "Fail", "Blocked", "Deferred", "N/A")
MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS = {"m": MAIN}


def excel_decode(value):
    return re.sub(r"_x([0-9A-Fa-f]{4})_", lambda match: chr(int(match[1], 16)), value)


def excel_encode(value):
    value = re.sub(r"_x[0-9A-Fa-f]{4}_", lambda match: "_x005F_" + match[0][1:], value)
    return "".join(f"_x{ord(char):04X}_" if ord(char) < 32 and char not in "\t\n\r" else char for char in value)


def escape(value):
    """Reversible inline escapes, never CSV quoting or embedded physical lines."""
    out = []
    for char in value:
        if char in "\\\t\n\r":
            out.append({"\\": "\\\\", "\t": "\\t", "\n": "\\n", "\r": "\\r"}[char])
        elif ord(char) < 32 or ord(char) == 127:
            out.append(f"\\u{ord(char):04x}")
        else:
            out.append(char)
    return "".join(out)


def unescape(value):
    out, index = [], 0
    while index < len(value):
        char = value[index]
        if char != "\\":
            if ord(char) < 32 or ord(char) == 127:
                raise ValueError("Unescaped control character")
            out.append(char)
            index += 1
            continue
        index += 1
        if index >= len(value):
            raise ValueError("Trailing escape")
        char = value[index]
        if char in "\\tnr":
            out.append({"\\": "\\", "t": "\t", "n": "\n", "r": "\r"}[char])
            index += 1
        elif char == "u" and re.fullmatch(r"[0-9a-fA-F]{4}", value[index + 1:index + 5]):
            code = int(value[index + 1:index + 5], 16)
            if code >= 32 and code != 127:
                raise ValueError("Unicode escapes are reserved for control characters")
            out.append(chr(code))
            index += 5
        else:
            raise ValueError(f"Unknown escape: \\{char}")
    return "".join(out)


def validate_cases(cases):
    seen = set()
    for case in cases:
        identifier = case["id"]
        if not re.fullmatch(r"[A-Z]+-\d{3}", identifier) or identifier in seen:
            raise ValueError(f"Invalid/duplicate Test ID: {identifier}")
        seen.add(identifier)
        for field in ("domain", "priority", "release_gate", "status", "requirement", "expected"):
            if not case[field]:
                raise ValueError(f"{identifier}: missing {field}")
        if case["status"] not in STATUSES:
            raise ValueError(f"{identifier}: unknown status {case['status']!r}")
        if case["priority"] not in ("P0", "P1", "P2"):
            raise ValueError(f"{identifier}: unknown priority")
        if case["release_gate"] not in ("Blocking", "Non-blocking"):
            raise ValueError(f"{identifier}: unknown release gate")
    if not cases:
        raise ValueError("Empty acceptance registry")


def load_cases(path=ROOT / "cases.tsv"):
    text = Path(path).read_bytes().decode("utf-8")
    if not text.endswith("\n") or "\r" in text or text.startswith("\ufeff"):
        raise ValueError("TSV must be UTF-8 without BOM, LF-only, with a final newline")
    lines = text[:-1].split("\n")
    if lines[0].split("\t") != list(FIELDS):
        raise ValueError("Unexpected TSV schema")
    cases = []
    for number, line in enumerate(lines[1:], 2):
        cells = line.split("\t")
        if len(cells) != len(FIELDS):
            raise ValueError(f"Physical line {number}: expected {len(FIELDS)} fields")
        try:
            case = dict(zip(FIELDS, map(unescape, cells)))
        except ValueError as error:
            raise ValueError(f"Physical line {number}: {error}") from error
        if "\t".join(escape(case[field]) for field in FIELDS) != line:
            raise ValueError(f"Physical line {number}: noncanonical escaping")
        cases.append(case)
    validate_cases(cases)
    return cases


def write_cases(cases, path):
    validate_cases(cases)
    lines = ["\t".join(FIELDS)]
    lines.extend("\t".join(escape(case[field]) for field in FIELDS) for case in cases)
    Path(path).write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


def read_xlsx(source):
    """Read cells, formulas/cached values and widths, without Excel automation."""
    archive = io.BytesIO(source) if isinstance(source, bytes) else source
    result = {}
    with zipfile.ZipFile(archive) as book:
        strings = []
        if "xl/sharedStrings.xml" in book.namelist():
            root = ET.fromstring(book.read("xl/sharedStrings.xml"))
            strings = [excel_decode("".join(t.text or "" for t in cell.findall(".//m:t", NS)))
                       for cell in root.findall("m:si", NS)]
        relationships = {item.attrib["Id"]: item.attrib["Target"]
                         for item in ET.fromstring(book.read("xl/_rels/workbook.xml.rels"))}
        for sheet in ET.fromstring(book.read("xl/workbook.xml")).findall("m:sheets/m:sheet", NS):
            target = relationships[sheet.attrib[f"{{{REL}}}id"]]
            path = target.lstrip("/") if target.startswith("/") else posixpath.normpath("xl/" + target)
            root = ET.fromstring(book.read(path))
            cells, formulas = {}, {}
            for cell in root.findall("m:sheetData/m:row/m:c", NS):
                address = cell.attrib["r"]
                value = cell.find("m:v", NS)
                value = value.text or "" if value is not None else ""
                if cell.attrib.get("t") == "s":
                    value = strings[int(value)]
                elif cell.attrib.get("t") == "inlineStr":
                    value = excel_decode("".join(t.text or "" for t in cell.findall(".//m:t", NS)))
                cells[address] = value
                formula = cell.find("m:f", NS)
                if formula is not None:
                    formulas[address] = formula.text or ""
            result[sheet.attrib["name"]] = {
                "cells": cells, "formulas": formulas,
                "widths": [float(col.attrib["width"]) for col in root.findall("m:cols/m:col", NS)],
            }
    return result


def column_name(number):
    name = ""
    while number:
        number, remainder = divmod(number - 1, 26)
        name = chr(65 + remainder) + name
    return name


def sheet_rows(sheet, columns):
    last = max(int(re.search(r"\d+$", address).group()) for address in sheet["cells"])
    return [[sheet["cells"].get(f"{column_name(col)}{row}", "")
             for col in range(1, columns + 1)] for row in range(1, last + 1)]


def cases_from_xlsx(book, generated=False):
    sheet = book["Acceptance Matrix"]
    if sheet["formulas"]:
        raise ValueError("Acceptance case cells contain formulas; manual migration review required")
    columns = XLSX_COLUMNS if generated else XLSX_COLUMNS[:-1]
    allowed = {column_name(index) for index in range(1, len(columns) + 1)}
    if any(re.sub(r"\d+$", "", address) not in allowed and value
           for address, value in sheet["cells"].items()):
        raise ValueError("Unexpected acceptance columns; review before migration")
    rows = sheet_rows(sheet, len(columns))
    if rows[0] != [label for label, _ in columns]:
        raise ValueError("Unexpected Acceptance Matrix headers")
    cases = []
    for row in rows[1:]:
        case = dict.fromkeys(FIELDS, "")
        case.update({field: value for (_, field), value in zip(columns, row)})
        cases.append(case)
    validate_cases(cases)
    return cases


def load_metadata(path=ROOT / "workbook_metadata.json"):
    return json.loads(Path(path).read_text(encoding="utf-8"))
