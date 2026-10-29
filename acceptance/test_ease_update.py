import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("ease_update", Path(__file__).parents[1] / "scripts/acceptance/ease/update_registry.py")
ease = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ease)


class EaseUpdateTests(unittest.TestCase):
    def test_only_status_and_evidence_change_and_other_bytes_survive(self):
        target = ["EASE-001", "Find", "P1", "Non-blocking", "Not Run", "requirement", "expected", "old", "sprint", "sub", "pre", "steps", "actor", "E2E", "Manual", "spec", "BUILD"]
        other = target.copy()
        other[0], other[7] = "AUTH-001", r"control \u001B remains uppercase"
        original = "header\n" + "\t".join(other) + "\n" + "\t".join(target) + "\n"
        updated = ease.update_fields(original, {"EASE-001": ("Pass", "Observed\tvalue\nsecond line")})
        self.assertEqual(updated.splitlines()[1], original.splitlines()[1])
        fields = updated.splitlines()[2].split("\t")
        self.assertEqual([v for i, v in enumerate(fields) if i not in (4, 7)], [v for i, v in enumerate(target) if i not in (4, 7)])
        self.assertEqual(fields[4], "Pass")
        self.assertEqual(fields[7], r"Observed\tvalue\nsecond line")

    def test_live_failure_outweighs_local_pass_and_a_skip_does_not_erase_it(self):
        self.assertEqual(ease.conservative_status([{"status": "Pass"}, {"status": "Fail"}]), "Fail")
        self.assertEqual(ease.conservative_status([{"status": "Pass"}, {"status": "Not Run"}]), "Pass")

    def test_supporting_tests_cannot_promote_manual_acceptance(self):
        with self.assertRaisesRegex(ValueError, "cannot promote manual"):
            ease.supplemental_results({"EASE-001": {"automation": "Manual"}}, {}, "", {"suites": []}, {"EASE-001": {"phoneBackfill": True}})

    def test_report_redacts_tokens_and_terminal_controls(self):
        token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmaXh0dXJlIn0.signature"
        result = ease.redact({"error": "\x1b[31m" + token + "\x1b[0m", "path": str(ease.ROOT) + "/case.cjs"})
        self.assertEqual(result["error"], "[redacted token]")
        self.assertEqual(result["path"], "<checkout>/case.cjs")
        self.assertEqual(ease.redact("sb_secret_abcdefghijklmnop Ease-abcdefghijklmnop"), "[redacted credential] [redacted credential]")

    def test_case_dates_use_lima_calendar_days(self):
        self.assertEqual(ease.case_day("2026-10-29T01:30:00Z"), "2026-10-28")
        self.assertEqual(ease.case_day("2026-10-29T06:30:00Z"), "2026-10-29")
