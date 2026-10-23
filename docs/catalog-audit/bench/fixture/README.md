# Smoke fixture (synthetic, not Laria data)

`build_fixture.py` writes a small catalog for the audit tooling only. It holds the 121 corpus identities, 29 real
sibling products and 45 manufacturers. Its aliases and the 99 lookup terms are the auditor's approximation of the ETL.
It exists to run the real catalog functions end to end and to check that the integrity checks detect defects. Its
numbers describe the fixture, not the production catalog.

```sh
# a database with the catalog migrations applied (20260927120000 … 20261021120000; 20261011 needs pg_cron)
python3 build_fixture.py > /tmp/fixture.sql
psql "$DSN" -v ON_ERROR_STOP=1 -f /tmp/fixture.sql     # truncates the catalog_* tables first: never point at production
```

## Seeded defects and the check that must catch each one

| Seed | Defect | Check | Detected on the smoke run |
| --- | --- | --- | --- |
| D1 | "Digital Delay" alias on DD-3 and DD-7, not flagged `is_ambiguous` | `alias_ambiguity_flag_wrong` | yes (1) |
| D2 | Katana family entity marked `detailed` and `publish_ready` | `family_detailed` | yes (1) |
| D3 | SM58 `polar_pattern` trusted with a conflicting value | `attr_trusted_with_conflict` | yes (1) |
| D4 | Store-title product "Player Telecaster Black" | `norm_noise_in_model` | yes (1) |
| D5 | `handedness` both in `variant_attributes` and stored at product level | `variant_attr_also_product_level` | yes (1) |
| D6 | F310 `body_shape` without `value_es`; Crush 20RT `technology` with the code `solid_state` as Spanish text | `attr_value_es_missing` | yes (2) |
| D7 | Manufacturer alias "UA" on Universal Audio and Alesis | `mfr_alias_collision` | yes (1) |
| D8 | Squier Affinity Jazz Bass in the electric guitar category | `category_name_contradiction` | yes (1) |

D1 also changes matching: "Boss DD-3 Digital Delay" becomes CONFLICTING (a tie with DD-7) instead of AUTO. This shows
how an unflagged shared seller name can demote a correct match.
