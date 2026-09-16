# V1 acceptance registry

`cases.tsv` is the sole canonical acceptance source. `sprints.tsv` is the selective retrieval guide. During Sprints 4–9, do not read or regenerate XLSX; update only relevant TSV rows. The tracked workbook has been removed to prevent stale-source confusion.

## Selective queries

Run from the repository root:

```sh
rg '^4\t' acceptance/sprints.tsv
rg '^REV-014\t' acceptance/cases.tsv
rg '^(PHOTO|REV|AUTH|WA|AN|SANA|SDASH)-' acceptance/cases.tsv
awk -F '\t' '$5 == "Fail"' acceptance/cases.tsv
awk -F '\t' '$5 == "Blocked"' acceptance/cases.tsv
```

`sprints.tsv` is retrieval guidance, not an exclusive per-case assignment or permission to mark cases passed. Prefixes may span several sprints. `owner_sprint` is blank where the original workbook had no per-case sprint assignment.

## Safe edits

The 17 columns, in order, are `id`, `domain`, `priority`, `release_gate`, `status`, `requirement`, `expected`, `evidence`, `owner_sprint`, `subdomain`, `preconditions`, `steps`, `actor`, `test_level`, `automation`, `spec_ref`, `baseline_impl`. All 16 original fields are retained without rewriting.

UTF-8, no BOM, LF endings and final newline. Each case occupies one physical line. Field encoding is reversible: backslash `\\`, tab `\t`, newline `\n`, carriage return `\r`, other ASCII controls `\u00xx`. Accents/punctuation remain literal. Do not CSV-quote or insert physical line breaks inside a field. `registry.py` provides the strict codec/parser.

For an authorized acceptance update, retrieve only the exact IDs/domain prefixes needed for the current sprint and edit only the requested status (column 5) and concise evidence (column 8). Preserve requirements, IDs, unrelated rows and existing ownership. Allowed statuses: `Not Run`, `Pass`, `Fail`, `Blocked`, `Deferred`, `N/A`. Never infer manual PASS from implementation or renumber IDs. Validate and review the relevant TSV diff:

```sh
python3 -B acceptance/validate.py
python3 -B -m unittest discover -s acceptance -p 'test_*.py'
git diff --check
git diff -- acceptance/cases.tsv
```

Normal validation checks TSV schema, encoding, required fields, unique IDs and allowed statuses/priorities/release gates, and reports current counts. It does not read XLSX or require workbook metadata. Workbook regression tests are dormant by default.

## Final V1 acceptance/freeze gate only

`generate_xlsx.py` is dormant until this gate. Generate the human workbook once, then validate it explicitly:

```sh
python3 -B acceptance/generate_xlsx.py
python3 -B acceptance/validate.py --workbook acceptance_matrix.xlsx
```

The standard-library generator retains four sheets, case fields, personas/traceability, filters, wrapped rows, frozen headers, status colors and counts calculated from TSV. Strings never become formulas. `workbook_metadata.json` contains only presentation/supporting-sheet data and migration provenance, not duplicate case records. Fixed ZIP metadata/order keeps output deterministic within the same runtime.

Historical `--baseline-git` / `--original PATH` validation and `migrate_xlsx.py` are retained for explicit archival audits only, not Sprints 4–9. Historical comparisons are expected to fail after intentional acceptance updates. Never import XLSX back over canonical TSV. At the final gate, workbook tooling tests can be enabled with `LARIA_FINAL_GATE_XLSX_TESTS=1`; they generate only temporary test artifacts, not the final root workbook.
