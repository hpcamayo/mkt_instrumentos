"""Reconcile executed EASE evidence only; dry-run unless --write is supplied."""
import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "acceptance"))
from registry import escape, load_cases  # noqa: E402

RANK = {"Not Run": 0, "Pass": 1, "Blocked": 2, "Fail": 3}


def case_day(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(ZoneInfo("America/Lima")).date().isoformat()


def latest_records(paths, known):
    records = {}
    for path in sorted(paths):
        for number, line in enumerate(path.read_text().splitlines(), 1):
            if not line.strip():
                continue
            row = json.loads(line)
            if row["id"] not in known or row["status"] not in RANK:
                raise ValueError(f"Unknown case/status in {path}:{number}")
            if row["status"] == "Pass" and not row.get("checks"):
                raise ValueError(f"Pass without assertions: {row['id']}")
            old = records.get(row["id"])
            if old is None or row.get("at", "") >= old.get("at", ""):
                records[row["id"]] = row
    return records


def conservative_status(records):
    return max((row["status"] for row in records), key=RANK.get, default="Not Run")


def source_only(record):
    return bool(record.get("checks")) and all(" asserts " in check["message"] for check in record["checks"])


def supplemental_results(cases, local, unit_log, sql_report, mapping):
    # Never promote a manual/owner workflow from supporting code or SQL tests.
    results = {}
    suites = {row["file"]: row for row in sql_report["suites"]}
    units_ok = bool(re.search(r"^# fail 0$", unit_log, re.M)) and not re.search(r"^\s*not ok \d+", unit_log, re.M)
    for identifier, support in mapping.items():
        case = cases[identifier]
        if case["automation"] != "Automated":
            raise ValueError(f"Supporting tests cannot promote manual case {identifier}")
        evidence = []
        passed = True
        for unit in support.get("unit", []):
            ok = units_ok and bool(re.search(r"^ok \d+ - " + re.escape(unit["name"]) + r"$", unit_log, re.M))
            passed &= ok
            evidence.append(f"unit: {unit['file']} — {unit['name']}")
        for file in support.get("sql", []):
            suite = suites.get(file, {})
            digest = hashlib.sha256((ROOT / file).read_bytes()).hexdigest()
            passed &= suite.get("status") == "Pass" and suite.get("sha256") == digest
            evidence.append(f"SQL: {file}")
        for browser in support.get("browser", []):
            passed &= local.get(browser, {}).get("status") == "Pass"
            evidence.append(f"local browser: {browser}")
        if support.get("phoneBackfill"):
            passed &= sql_report.get("phoneBackfill") is True
            evidence.append("SQL: actual phone migration over legacy, foreign and already-correct fixtures")
        if passed and evidence:
            results[identifier] = {"status": "Pass", "support": evidence}
    return results


def audit_results(run):
    """A failing observation is decisive; a partial accessibility sweep cannot grant a pass."""
    pages = json.loads((run / "local/a11y-pages.json").read_text())
    states = json.loads((run / "local/a11y-states.json").read_text())
    observations = []
    for source, rows in [("a11y-pages.json", pages), ("a11y-states.json", states)]:
        for row in rows:
            for violation in row.get("violations", []):
                observations.append({"source": source, "path": row["path"], "width": row["width"],
                                     "role": row["role"], "state": row.get("name"),
                                     "rule": violation["id"], "impact": violation.get("impact"),
                                     "nodes": violation.get("nodes", [])})
    expected = {(role, width) for role in ("visitor", "buyer", "seller", "store") for width in (390, 1366)}
    complete = (len(pages) >= 100 and len(states) >= 27
                and {(row["role"], row["width"]) for row in pages} == expected
                and {(row["role"], row["width"]) for row in states} == expected
                and not any(row.get("note") for row in states))
    clean_status = "Pass" if complete else "Not Run"
    return {
        "EASE-710": {"status": "Not Run", "support": ["Partial focus sweep only; comparison tray, alert prompt and undo states remain unverified."]},
        "EASE-711": {"status": "Fail" if any(v["rule"] == "target-size" for v in observations) else clean_status,
                     "observations": [v for v in observations if v["rule"] == "target-size"]},
        "EASE-713": {"status": "Fail" if observations else clean_status, "observations": observations,
                     "pages": len(pages), "states": len(states)},
    }


def redact(value):
    if isinstance(value, str):
        value = re.sub(r"\x1b\[[0-9;]*m", "", value)
        value = re.sub(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[redacted token]", value)
        value = re.sub(r"(?:sb_(?:secret|publishable)_[A-Za-z0-9_-]+|Ease-[A-Za-z0-9_-]{16,})", "[redacted credential]", value)
        return value.replace(str(ROOT), "<checkout>")
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, dict):
        return {key: redact(item) for key, item in value.items()}
    return value


def compact(record):
    return {"status": record["status"], "at": record.get("at"), "checks": len(record.get("checks", [])), "assertions": record.get("checks", []),
            "failed_checks": [check["message"] for check in record.get("checks", []) if not check["ok"]],
            "error": record.get("error"), "notes": [note for note in record.get("notes", []) if not note.startswith("ci ")],
            "inconclusive_guard": record.get("liveUnsafe"), "problems": record.get("problems", []),
            "outside_recipients": record.get("touched")}


def update_fields(text, changes):
    lines = text.splitlines(keepends=True)
    for index, line in enumerate(lines):
        fields = line.removesuffix("\n").split("\t")
        if fields[0] not in changes:
            continue
        status, evidence = changes[fields[0]]
        if status not in RANK:
            raise ValueError(f"Invalid status {status}")
        fields[4], fields[7] = escape(status), escape(evidence)
        lines[index] = "\t".join(fields) + ("\n" if line.endswith("\n") else "")
    return "".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run", type=Path)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--registry-only", help="Comma-separated IDs to update; the report still includes every observed case")
    parser.add_argument("--application-revision", default="not recorded", help="Source commit actually served by the local browser-test app")
    args = parser.parse_args()
    registry_path = ROOT / "acceptance/cases.tsv"
    original = registry_path.read_bytes().decode("utf-8")
    rows = load_cases()
    changes = {}
    cases = {row["id"]: row for row in rows if row["id"].startswith("EASE-")}
    paths = list((args.run / "local").glob("results-*.jsonl")) + list((args.run / "local").glob("reruns*.jsonl"))
    selected = set(args.registry_only.split(",")) if args.registry_only else set(cases)
    if selected - cases.keys():
        raise ValueError(f"Unknown selected IDs: {sorted(selected - cases.keys())}")
    local = latest_records(paths, cases)
    live = latest_records([p for p in [args.run / "live/visitor.jsonl", args.run / "live/accounts.jsonl"] if p.exists()], cases)
    unit_log = (args.run / "local/unit-final.tap").read_text()
    sql_report = json.loads((args.run / "local/sql-final.json").read_text())
    mapping = json.loads((Path(__file__).parent / "supplemental-coverage.json").read_text())
    supplemental = supplemental_results(cases, local, unit_log, sql_report, mapping)
    audits = audit_results(args.run)
    report = {"local_application_revision": args.application_revision,
              "live_url": "https://laria.audio", "live_deployment_revision": "not independently verified",
              "generated_at": datetime.now(ZoneInfo("America/Lima")).isoformat(), "cases": []}
    deployment_path = args.run / "live/deployment.json"
    if deployment_path.exists():
        deployment = json.loads(deployment_path.read_text())
        report["live_deployment_revision"] = deployment["git_sha"]
        report["live_deployment_observation"] = deployment
        report["live_revision_scope"] = "Snapshot observed during the run; recorded attempts may span deployments."
    for identifier, case in cases.items():
        phases = []
        item = {"id": identifier}
        for name, records in [("local", local), ("live", live)]:
            if identifier not in records:
                continue
            record = records[identifier].copy()
            if case["automation"] != "Automated" and record["status"] == "Pass" and source_only(record):
                record["status"] = "Not Run"
                record.setdefault("notes", []).append("Source assertions alone do not accept a manual workflow.")
            phases.append(record)
            item[name] = compact(record)
        if identifier in supplemental:
            phases.append(supplemental[identifier])
            item["supplemental"] = supplemental[identifier]["support"]
        if identifier in audits:
            phases.append(audits[identifier])
            item["audit"] = audits[identifier]
        status = conservative_status(phases) if phases else case["status"]
        item["status"] = status
        if phases:
            revisions = {"local": report["local_application_revision"], "live": report["live_deployment_revision"]}
            descriptions = []
            for name in ["local", "live"]:
                if name in item:
                    revision = revisions[name]
                    stamp = f" {revision[:7]}" if re.fullmatch(r"[0-9a-f]{7,40}", revision) else ""
                    descriptions.append(f"{name}{stamp}: {item[name]['status']}")
            if "supplemental" in item:
                descriptions.append("supporting unit/SQL checks: Pass")
            if "audit" in item:
                descriptions.append(f"accessibility audit: {item['audit']['status']}")
            day = max((case_day(phase["at"]) for phase in phases if phase.get("at")), default=datetime.now(ZoneInfo("America/Lima")).date().isoformat())
            evidence = f"{day} — {'; '.join(descriptions)}. {args.report.as_posix()} ({identifier})."
            if identifier in selected:
                case["status"], case["evidence"] = status, evidence
                changes[identifier] = (status, evidence)
        else:
            item["limitation"] = "No dedicated check in the recovered harness; no manual acceptance inferred."
        report["cases"].append(item)
    report["counts"] = dict(Counter(item["status"] for item in report["cases"]))
    report["registry_counts"] = dict(Counter(row["status"] for row in rows))
    report["local_cases"] = len(local)
    report["live_cases"] = len(live)
    report["supplemental_cases"] = len(supplemental)
    print(json.dumps({key: report[key] for key in ["counts", "registry_counts", "local_cases", "live_cases", "supplemental_cases"]}, indent=2))
    if args.write:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(redact(report), ensure_ascii=False, indent=2) + "\n")
        if registry_path.read_bytes().decode("utf-8") != original:
            raise ValueError("The registry changed during reconciliation; retry against the new version")
        registry_path.write_bytes(update_fields(original, changes).encode("utf-8"))


if __name__ == "__main__":
    main()
