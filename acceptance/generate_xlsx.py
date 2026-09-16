"""Dormant until final V1 acceptance/freeze: generate the human workbook once.

Do not run during Sprints 4–9. Uses only the Python standard library.
"""

import argparse
import math
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

from registry import MAIN, REL, ROOT, STATUSES, XLSX_COLUMNS, column_name, excel_encode, load_cases, load_metadata

ET.register_namespace("", MAIN)
ET.register_namespace("r", REL)
PACKAGE = "http://schemas.openxmlformats.org/package/2006/relationships"


def child(parent, name, attrs=None, text=None):
    node = ET.SubElement(parent, f"{{{MAIN}}}{name}", attrs or {})
    if text is not None:
        node.text = str(text)
    return node


def xml(node):
    return ET.tostring(node, encoding="utf-8", xml_declaration=True)


def styles():
    root = ET.Element(f"{{{MAIN}}}styleSheet")
    fonts = child(root, "fonts", {"count": "2"})
    for bold in (False, True):
        font = child(fonts, "font")
        child(font, "sz", {"val": "10"})
        child(font, "name", {"val": "Arial"})
        if bold:
            child(font, "b")
        child(font, "color", {"rgb": "FFFFFFFF" if bold else "FF172337"})
    fills = child(root, "fills", {"count": "4"})
    for pattern, color in (("none", None), ("gray125", None), ("solid", "FF172337"), ("solid", "FFF1F5F9")):
        fill = child(fills, "fill")
        node = child(fill, "patternFill", {"patternType": pattern})
        if color:
            child(node, "fgColor", {"rgb": color})
            child(node, "bgColor", {"indexed": "64"})
    borders = child(root, "borders", {"count": "1"})
    border = child(borders, "border")
    for side in ("left", "right", "top", "bottom", "diagonal"):
        child(border, side)
    base = child(root, "cellStyleXfs", {"count": "1"})
    child(base, "xf", {"numFmtId": "0", "fontId": "0", "fillId": "0", "borderId": "0"})
    formats = child(root, "cellXfs", {"count": "3"})
    for font, fill in ((0, 0), (1, 2), (0, 3)):
        node = child(formats, "xf", {"numFmtId": "0", "fontId": str(font), "fillId": str(fill), "borderId": "0", "xfId": "0", "applyAlignment": "1"})
        child(node, "alignment", {"vertical": "top", "wrapText": "1"})
    cell_styles = child(root, "cellStyles", {"count": "1"})
    child(cell_styles, "cellStyle", {"name": "Normal", "xfId": "0", "builtinId": "0"})
    dxfs = child(root, "dxfs", {"count": "6"})
    for color in ("FFDCFCE7", "FFFEE2E2", "FFFEF3C7", "FFE2E8F0", "FFF1F5F9", "FFE0F2FE"):
        fill = child(child(dxfs, "dxf"), "fill")
        pattern = child(fill, "patternFill", {"patternType": "solid"})
        child(pattern, "fgColor", {"rgb": color})
        child(pattern, "bgColor", {"indexed": "64"})
    return xml(root)


def worksheet(rows, widths, matrix=False, summary=False):
    root = ET.Element(f"{{{MAIN}}}worksheet")
    last = f"{column_name(len(widths))}{len(rows)}"
    child(root, "dimension", {"ref": f"A1:{last}"})
    views = child(root, "sheetViews")
    view = child(views, "sheetView", {"workbookViewId": "0"})
    child(view, "pane", {"ySplit": "3" if summary else "1", "topLeftCell": "A4" if summary else "B2" if matrix else "A2", "activePane": "bottomRight" if matrix else "bottomLeft", "state": "frozen", **({"xSplit": "1"} if matrix else {})})
    child(root, "sheetFormatPr", {"defaultRowHeight": "18"})
    cols = child(root, "cols")
    for index, width in enumerate(widths, 1):
        child(cols, "col", {"min": str(index), "max": str(index), "width": str(width), "customWidth": "1"})
    data = child(root, "sheetData")
    for number, values in enumerate(rows, 1):
        header = number == (3 if summary else 1)
        lines = max((sum(max(1, math.ceil(len(line) / max(1, widths[i] - 2))) for line in str(value).split("\n")) for i, value in enumerate(values)), default=1)
        row = child(data, "row", {"r": str(number), "ht": str(min(409, max(26 if header else 20, lines * 15 + 6))), "customHeight": "1"})
        for index, value in enumerate(values, 1):
            style = "1" if header else "2" if number % 2 == 0 else "0"
            attrs = {"r": f"{column_name(index)}{number}", "s": style}
            if isinstance(value, int):
                child(child(row, "c", attrs), "v", text=value)
            else:
                cell = child(row, "c", {**attrs, "t": "inlineStr"})
                child(child(cell, "is"), "t", {"{http://www.w3.org/XML/1998/namespace}space": "preserve"}, excel_encode(str(value)))
    if not summary:
        child(root, "autoFilter", {"ref": f"A1:{last}"})
    if matrix:
        formatting = child(root, "conditionalFormatting", {"sqref": f"O2:O{len(rows)}"})
        for index, status in enumerate(("Pass", "Fail", "Blocked", "Deferred", "Not Run", "N/A")):
            rule = child(formatting, "cfRule", {"type": "cellIs", "dxfId": str(index), "priority": str(index + 1), "operator": "equal"})
            child(rule, "formula", text=f'"{status}"')
        validations = child(root, "dataValidations", {"count": "1"})
        node = child(validations, "dataValidation", {"type": "list", "allowBlank": "0", "showErrorMessage": "1", "errorTitle": "Unknown status", "error": "Use an existing acceptance status.", "sqref": f"O2:O{len(rows)}"})
        child(node, "formula1", text='"' + ",".join(STATUSES) + '"')
    return xml(root)


def summary_rows(cases, metadata):
    metrics = [("Total test cases", len(cases))]
    for label, field, value in (("P0 cases", "priority", "P0"), ("Blocking cases", "release_gate", "Blocking"), ("Automated", "automation", "Automated"), ("Manual", "automation", "Manual"), ("Both", "automation", "Both")):
        metrics.append((label, sum(case[field] == value for case in cases)))
    metrics.extend((label, sum(case["status"] == status for case in cases)) for label, status in (("Passed", "Pass"), ("Failed", "Fail"), ("Blocked", "Blocked"), ("Deferred", "Deferred"), ("N/A", "N/A"), ("Not Run", "Not Run")))
    domains = list(dict.fromkeys(metadata["summary_domains"] + [case["domain"] for case in cases]))
    rows = [[metadata["summary_title"], "", "", "", "", ""], [""] * 6, ["KPI", "Value", "", "Domain", "Cases", "P0"]]
    for index in range(max(len(metrics), len(domains))):
        left = list(metrics[index]) if index < len(metrics) else ["", ""]
        domain = domains[index] if index < len(domains) else ""
        right = [domain, sum(case["domain"] == domain for case in cases), sum(case["domain"] == domain and case["priority"] == "P0" for case in cases)] if domain else ["", "", ""]
        rows.append(left + [""] + right)
    return rows


def generate(cases_path=ROOT / "cases.tsv", output=ROOT.parent / "acceptance_matrix.xlsx", metadata_path=ROOT / "workbook_metadata.json"):
    cases, metadata = load_cases(cases_path), load_metadata(metadata_path)
    sheets = [("Acceptance Matrix", [[label for label, _ in XLSX_COLUMNS]] + [[case[field] for _, field in XLSX_COLUMNS] for case in cases], metadata["matrix_widths"]), ("Coverage Summary", summary_rows(cases, metadata), [28, 16, 3, 28, 12, 12])]
    sheets.extend((sheet["name"], sheet["rows"], sheet["widths"]) for sheet in metadata["support_sheets"])
    workbook = ET.Element(f"{{{MAIN}}}workbook")
    nodes = child(workbook, "sheets")
    for index, (name, _, _) in enumerate(sheets, 1):
        child(nodes, "sheet", {"name": name, "sheetId": str(index), f"{{{REL}}}id": f"rId{index}"})
    entries = {"xl/workbook.xml": xml(workbook), "xl/styles.xml": styles()}
    relationships = ET.Element("Relationships", {"xmlns": PACKAGE})
    for index, (_, rows, widths) in enumerate(sheets, 1):
        ET.SubElement(relationships, "Relationship", {"Id": f"rId{index}", "Type": REL + "/worksheet", "Target": f"worksheets/sheet{index}.xml"})
        entries[f"xl/worksheets/sheet{index}.xml"] = worksheet(rows, widths, matrix=index == 1, summary=index == 2)
    ET.SubElement(relationships, "Relationship", {"Id": "styles", "Type": REL + "/styles", "Target": "styles.xml"})
    entries["xl/_rels/workbook.xml.rels"] = xml(relationships)
    relationships = ET.Element("Relationships", {"xmlns": PACKAGE})
    ET.SubElement(relationships, "Relationship", {"Id": "rId1", "Type": REL + "/officeDocument", "Target": "xl/workbook.xml"})
    entries["_rels/.rels"] = xml(relationships)
    types = ET.Element("Types", {"xmlns": "http://schemas.openxmlformats.org/package/2006/content-types"})
    for ext, content in (("rels", "application/vnd.openxmlformats-package.relationships+xml"), ("xml", "application/xml")):
        ET.SubElement(types, "Default", {"Extension": ext, "ContentType": content})
    for part, content in [("/xl/workbook.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"), ("/xl/styles.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml")] + [(f"/xl/worksheets/sheet{i}.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml") for i in range(1, len(sheets) + 1)]:
        ET.SubElement(types, "Override", {"PartName": part, "ContentType": content})
    entries["[Content_Types].xml"] = xml(types)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in sorted(entries):
            info = zipfile.ZipInfo(name, (2000, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, entries[name])
    return len(cases)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path, default=ROOT / "cases.tsv")
    parser.add_argument("--metadata", type=Path, default=ROOT / "workbook_metadata.json")
    parser.add_argument("--output", type=Path, default=ROOT.parent / "acceptance_matrix.xlsx")
    args = parser.parse_args()
    print(f"Generated {generate(args.cases, args.output, args.metadata)} cases → {args.output}")
