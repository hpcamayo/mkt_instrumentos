"""Lightweight codec, generation and semantic regression tests."""

import tempfile
import unittest
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

from generate_xlsx import generate
from registry import NS, ROOT, cases_from_xlsx, escape, excel_decode, excel_encode, load_cases, read_xlsx, unescape, write_cases
from validate import compare, validate


class RegistryTests(unittest.TestCase):
    def test_inline_codec(self):
        value = "Perú — ¿sí?\tuno\ndos\r\\n\\t\x00\x1f\x7f"
        encoded = escape(value)
        self.assertNotIn("\n", encoded)
        self.assertNotIn("\t", encoded)
        self.assertEqual(unescape(encoded), value)
        self.assertEqual(excel_decode(excel_encode(value + "_x000A_")), value + "_x000A_")

    def test_bad_escapes(self):
        for value in ("\\", "\\q", "\\u1234", "\\u0", "\x00"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                unescape(value)

    def test_parser_and_duplicates(self):
        cases = load_cases()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "cases.tsv"
            write_cases(cases, path)
            self.assertEqual(load_cases(path), cases)
            self.assertEqual(len(path.read_bytes().splitlines()), len(cases) + 1)
            with self.assertRaises(ValueError):
                write_cases(cases + [cases[0]], path)
            for bad in (path.read_bytes().replace(b"\n", b"\r\n"), b"\xef\xbb\xbf" + path.read_bytes(), path.read_bytes().replace(b"Not Run", b"Unknown", 1), path.read_bytes().rstrip(b"\n")):
                path.write_bytes(bad)
                with self.assertRaises(ValueError):
                    load_cases(path)
                write_cases(cases, path)

    def test_deterministic_and_updated_summary(self):
        with tempfile.TemporaryDirectory() as directory:
            first, second = (Path(directory) / name for name in ("first.xlsx", "second.xlsx"))
            generate(output=first)
            generate(output=second)
            self.assertEqual(first.read_bytes(), second.read_bytes())
            cases = load_cases()
            cases[0]["status"] = "Deferred"
            cases[0]["evidence"] = "=1+1\tPerú\nLiteral _x000A_ \\n\x00"
            source = Path(directory) / "cases.tsv"
            write_cases(cases, source)
            generate(source, second)
            compare(cases, cases_from_xlsx(read_xlsx(second), generated=True), "Special strings")
            self.assertFalse(read_xlsx(second)["Acceptance Matrix"]["formulas"])
            validate(source, second, ROOT / "workbook_metadata.json")

    def test_field_changes_detected(self):
        cases = load_cases()
        for field in cases[0]:
            changed = [dict(case) for case in cases]
            changed[0][field] += " changed"
            with self.subTest(field=field), self.assertRaises(ValueError):
                compare(cases, changed, "Mutation")

    def test_workbook_presentation(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "book.xlsx"
            generate(output=path)
            with zipfile.ZipFile(path) as archive:
                for index in range(1, 5):
                    sheet = ET.fromstring(archive.read(f"xl/worksheets/sheet{index}.xml"))
                    self.assertIsNotNone(sheet.find("m:sheetViews/m:sheetView/m:pane", NS))
                    self.assertIsNotNone(sheet.find("m:cols", NS))
                    if index != 2:
                        self.assertIsNotNone(sheet.find("m:autoFilter", NS))
                matrix = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
                self.assertEqual(len(matrix.findall("m:conditionalFormatting/m:cfRule", NS)), 6)
                self.assertIsNotNone(matrix.find("m:dataValidations", NS))


if __name__ == "__main__":
    unittest.main()
