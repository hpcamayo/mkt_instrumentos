# V1 acceptance registry

`cases.tsv` is canonical. Root `acceptance_matrix.xlsx` is a generated human view, not an input for normal implementation work. Query only relevant rows to avoid processing the whole workbook.

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

For an authorized acceptance update, find exact IDs and edit only the requested status (column 5) and concise evidence (column 8). Preserve requirements, IDs, unrelated rows and existing ownership. Allowed statuses: `Not Run`, `Pass`, `Fail`, `Blocked`, `Deferred`, `N/A`. Never infer manual PASS from implementation or renumber IDs. Regenerate and review the TSV diff:

```sh
python3 -B acceptance/generate_xlsx.py
python3 -B acceptance/validate.py
python3 -B -m unittest discover -s acceptance -p 'test_*.py'
git diff --check
git diff -- acceptance/cases.tsv
```

The generator uses only Python's standard library. Fixed ZIP metadata/order makes repeated generation byte-identical within the same runtime. It retains four sheets, all case fields, supporting personas/traceability, filters, readable wrapped rows, frozen headers, status colors and counts recalculated from TSV. Strings are never interpreted as formulas. `workbook_metadata.json` contains only presentation/supporting-sheet data and migration provenance, not duplicate case records.

## Migration audit

```sh
python3 -B acceptance/validate.py --baseline-git
# Or use an independently retained original workbook:
python3 -B acceptance/validate.py --original /path/to/original.xlsx
```

This checks the exact migration-time source hash, all fields by ID, row order/count, and supporting sheets. It is expected to fail after intentional future acceptance changes; normal validation checks the current TSV against the regenerated workbook. `migrate_xlsx.py` is a guarded one-time importer, not a normal update workflow. Do not import the generated workbook back over canonical TSV.
